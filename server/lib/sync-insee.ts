/**
 * Axe 2 — Indexation automatique INSEE
 *
 * Récupère automatiquement les indices INSEE (IRL, ILC, ILAT, ICC)
 * depuis l'API publique INSEE (SDMX) et les stocke en base.
 * Déclenche l'indexation automatique des baux AM après mise à jour.
 */
import { db, pool } from "../db";
import { indices, bauxAM } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { randomUUID } from "crypto";

// ─── INSEE SDMX API ────────────────────────────────────────

// Mapping indices → séries INSEE (identifiants SDMX)
const INSEE_SERIES: Record<string, { seriesId: string; label: string }> = {
  IRL: { seriesId: "001515333", label: "Indice de Référence des Loyers" },
  ILC: { seriesId: "001515926", label: "Indice des Loyers Commerciaux" },
  ILAT: { seriesId: "001609810", label: "Indice des Loyers des Activités Tertiaires" },
  ICC: { seriesId: "000008630", label: "Indice du Coût de la Construction" },
};

interface InseeValue {
  trimestre: string; // e.g. "T1-2025"
  valeur: number;
}

/**
 * Fetch latest values from INSEE SDMX API for a given series.
 * Tries both the V1 and the legacy endpoint format.
 */
async function fetchInseeSeriesValues(seriesId: string): Promise<InseeValue[]> {
  const urls = [
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}?lastNObservations=12`,
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { "Accept": "application/xml" },
      });

      if (!response.ok) {
        logger.warn(`INSEE API returned ${response.status} for ${url}`);
        continue;
      }

      const text = await response.text();
      const values = parseInseeXmlResponse(text);
      if (values.length > 0) {
        return values;
      }
      logger.warn(`INSEE API: no observations parsed for series ${seriesId}, response length: ${text.length}`);
    } catch (err: any) {
      logger.warn(`INSEE API fetch failed for series ${seriesId} (${url}): ${err.message}`);
    }
  }

  return [];
}

/**
 * Parse INSEE SDMX XML response.
 * The XML uses attributes on <Obs> elements:
 *   <Obs TIME_PERIOD="2025-Q4" OBS_VALUE="145.78" .../>
 */
function parseInseeXmlResponse(text: string): InseeValue[] {
  const values: InseeValue[] = [];
  const obsPattern = /<Obs\s+([^>]+)\/?>/g;
  let obsMatch;
  while ((obsMatch = obsPattern.exec(text)) !== null) {
    const attrs = obsMatch[1];
    const timePeriod = attrs.match(/TIME_PERIOD="([^"]+)"/)?.[1];
    const obsValue = attrs.match(/OBS_VALUE="([^"]+)"/)?.[1];
    if (timePeriod && obsValue) {
      const trimestre = convertPeriod(timePeriod);
      const valeur = Number(obsValue);
      if (trimestre && !isNaN(valeur)) {
        values.push({ trimestre, valeur });
      }
    }
  }
  return values;
}

function convertPeriod(period: string): string | null {
  // "2025-Q1" → "T1-2025"
  const m = period.match(/(\d{4})-Q(\d)/);
  if (m) return `T${m[2]}-${m[1]}`;
  // "2025-T1" → "T1-2025"
  const m2 = period.match(/(\d{4})-T(\d)/);
  if (m2) return `T${m2[2]}-${m2[1]}`;
  // Already in "T1-2025" format
  if (/^T\d-\d{4}$/.test(period)) return period;
  // Monthly format "2025-03" → convert to quarter "T1-2025"
  const m3 = period.match(/^(\d{4})-(\d{2})$/);
  if (m3) {
    const month = parseInt(m3[2], 10);
    const quarter = Math.ceil(month / 3);
    return `T${quarter}-${m3[1]}`;
  }
  return null;
}

// ─── Sync INSEE indices to DB ──────────────────────────────

/**
 * Synchronise les indices INSEE et les stocke en base.
 * Utilise ON CONFLICT pour éviter les doublons.
 */
export async function syncIndicesINSEE(): Promise<{ synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];

  for (const [type, { seriesId, label }] of Object.entries(INSEE_SERIES)) {
    try {
      const values = await fetchInseeSeriesValues(seriesId);
      if (values.length === 0) {
        errors.push(`${type}: aucune donnée récupérée depuis l'API INSEE`);
        continue;
      }

      // Get existing indices for this type
      const existing = await db.select().from(indices).where(eq(indices.type, type));
      const existingMap = new Map(existing.map((e) => [e.trimestre, e]));

      for (const v of values) {
        if (!existingMap.has(v.trimestre)) {
          try {
            await db.insert(indices).values({
              type,
              trimestre: v.trimestre,
              valeur: String(v.valeur),
            });
            synced++;
          } catch (err: any) {
            // Handle unique constraint violation (race condition)
            if (err.code === "23505") continue;
            throw err;
          }
        }
      }

      const newForType = values.filter((v) => !existingMap.has(v.trimestre)).length;
      logger.info(`sync-insee: ${type} — ${values.length} valeurs, ${newForType} nouvelles`);
    } catch (err: any) {
      errors.push(`${type}: ${err.message}`);
      logger.error(`sync-insee: erreur pour ${type}`, { error: err.message });
    }
  }

  return { synced, errors };
}

// ─── Default index assignment ──────────────────────────────

/**
 * Détermine l'indice par défaut selon le type de bail :
 *   - habitation → IRL (Indice de Référence des Loyers)
 *   - commercial, crèche, professionnel → ILC (Indice des Loyers Commerciaux)
 *   - bureau, tertiaire → ILAT (Indice des Loyers des Activités Tertiaires)
 */
function defaultIndiceForType(typeBail: string | null): string {
  if (!typeBail) return "ILC";
  const t = typeBail.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("habitation") || t.includes("logement")) return "IRL";
  if (t.includes("bureau") || t.includes("tertiaire")) return "ILAT";
  return "ILC"; // commercial, crèche, professionnel
}

/** Build a map of latest index value per type from all stored indices */
function buildLatestIndicesMap(allIndices: Array<{ type: string; trimestre: string; valeur: string }>) {
  const latestByType = new Map<string, { trimestre: string; valeur: number }>();
  for (const idx of allIndices) {
    const existing = latestByType.get(idx.type);
    if (!existing || idx.trimestre.localeCompare(existing.trimestre) > 0) {
      latestByType.set(idx.type, { trimestre: idx.trimestre, valeur: Number(idx.valeur) });
    }
  }
  return latestByType;
}

/**
 * Assigne automatiquement l'indice de référence et la valeur de base
 * aux baux AM qui n'en ont pas encore.
 */
export async function assignDefaultIndices(): Promise<{ assigned: number; errors: string[] }> {
  let assigned = 0;
  const errors: string[] = [];

  const allBaux = await db.select().from(bauxAM)
    .where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt)));
  const allIndices = await db.select().from(indices);
  const latestByType = buildLatestIndicesMap(allIndices);

  for (const bail of allBaux) {
    try {
      if (bail.forceManual) continue;
      if (bail.indiceReference) continue; // Already assigned

      const indiceType = defaultIndiceForType(bail.typeBail);
      const latest = latestByType.get(indiceType);
      if (!latest) continue;

      await db.update(bauxAM)
        .set({
          indiceReference: indiceType,
          trimestreRef: latest.trimestre,
          valeurIndiceBase: String(latest.valeur),
          updatedAt: new Date(),
        })
        .where(eq(bauxAM.id, bail.id));

      assigned++;
      logger.info(`assign-default-indices: bail AM "${bail.id}" → ${indiceType} (${latest.trimestre} = ${latest.valeur})`);
    } catch (err: any) {
      errors.push(`Bail ${bail.id}: ${err.message}`);
    }
  }

  logger.info(`assign-default-indices: ${assigned} baux AM mis à jour`);
  return { assigned, errors };
}

// ─── Backfill base index values from INSEE ─────────────────

/**
 * Remplit `valeurIndiceBase` pour les baux AM qui ont un `indiceReference`
 * et un `trimestreRef` mais pas de valeur (cas courant à l'import Excel
 * quand la cellule ne contient que "ILC" ou "ILC 3T2024" sans valeur).
 * Utilise l'indice INSEE correspondant s'il existe en base; sinon, prend
 * l'indice le plus proche antérieur au trimestre demandé.
 */
export async function backfillBaseIndexValues(): Promise<{ filled: number; missing: number }> {
  let filled = 0;
  let missing = 0;

  const allBaux = await db.select().from(bauxAM)
    .where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt)));
  const allIndices = await db.select().from(indices);

  // Group indices by type, sorted ascending by trimestre
  const byType = new Map<string, Array<{ trimestre: string; valeur: number }>>();
  for (const idx of allIndices) {
    if (!byType.has(idx.type)) byType.set(idx.type, []);
    byType.get(idx.type)!.push({ trimestre: idx.trimestre, valeur: Number(idx.valeur) });
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.trimestre.localeCompare(b.trimestre));
  }

  for (const bail of allBaux) {
    const curr = Number(bail.valeurIndiceBase || 0);
    if (curr > 0) continue;
    if (!bail.indiceReference || !bail.trimestreRef) continue;

    const list = byType.get(bail.indiceReference) || [];
    if (list.length === 0) { missing++; continue; }

    // Exact match first
    let match = list.find((x) => x.trimestre === bail.trimestreRef);
    // Otherwise most recent trimestre ≤ trimestreRef
    if (!match) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].trimestre <= bail.trimestreRef) { match = list[i]; break; }
      }
    }
    if (!match) { missing++; continue; }

    await db.update(bauxAM)
      .set({ valeurIndiceBase: String(match.valeur), updatedAt: new Date() })
      .where(eq(bauxAM.id, bail.id));
    filled++;
    logger.info(`backfill-indice-base: bail ${bail.id} → ${bail.indiceReference} ${match.trimestre} = ${match.valeur}`);
  }

  logger.info(`backfill-indice-base: ${filled} baux complétés, ${missing} sans correspondance`);
  return { filled, missing };
}

// ─── Auto-indexation AM baux ───────────────────────────────

/**
 * Normalise un trimestre vers le format canonique "T1-2025".
 * Gère "T1 2025", "T1-2025", "1T2025", "2025-Q1", "2025-T1".
 */
function normalizeTrimestre(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Already canonical
  if (/^T\d-\d{4}$/.test(s)) return s;
  // "T1 2025" → "T1-2025" (space to hyphen)
  const m1 = s.match(/^T(\d)\s+(\d{4})$/);
  if (m1) return `T${m1[1]}-${m1[2]}`;
  // "1T2025" → "T1-2025"
  const m2 = s.match(/^(\d)T(\d{4})$/);
  if (m2) return `T${m2[1]}-${m2[2]}`;
  // ISO-like "2025-Q1" or "2025-T1"
  return convertPeriod(s);
}

/**
 * Applique l'indexation automatique sur tous les baux AM éligibles.
 * Utilise une transaction pour garantir la cohérence.
 *
 * Un bail est éligible si :
 * - indiceReference est défini (IRL, ILC, ILAT, ICC)
 * - loyerBaseHT est défini et > 0
 * - valeurIndiceBase est définie et > 0
 * - forceManual !== true
 * - Un indice plus récent est disponible
 */
export async function autoIndexBauxAM(): Promise<{ indexed: number; skipped: number; errors: string[] }> {
  let indexed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const allBaux = await db.select().from(bauxAM)
    .where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt)));
  const allIndices = await db.select().from(indices);
  const latestByType = buildLatestIndicesMap(allIndices);

  // Use a transaction for atomicity
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const bail of allBaux) {
      try {
        if (bail.forceManual) { skipped++; continue; }
        if (!bail.indiceReference) { skipped++; continue; }

        const baseLoyer = Number(bail.loyerBaseHT || 0);
        const baseIndice = Number(bail.valeurIndiceBase || 0);
        if (baseLoyer <= 0 || baseIndice <= 0) { skipped++; continue; }

        const type = bail.indiceReference;
        const latest = latestByType.get(type);
        if (!latest) { skipped++; continue; }

        // Normalize stored trimestre for comparison
        const storedTrimestre = normalizeTrimestre(bail.trimestreRef);
        const latestTrimestre = latest.trimestre;

        // Skip if the latest index is the same or older than what's already applied
        if (storedTrimestre && latestTrimestre <= storedTrimestre) { skipped++; continue; }

        // Calculate new rent: loyerBase × (indiceNouveau / indiceBase)
        const nouveauLoyer = Math.round(baseLoyer * (latest.valeur / baseIndice) * 100) / 100;
        const currentLoyer = Number(bail.loyerHTActu || bail.loyerAnnuel || 0);

        // Only update if meaningful change (> 0.01 EUR)
        if (Math.abs(nouveauLoyer - currentLoyer) < 0.01) { skipped++; continue; }

        const tauxVariation = Math.round(((latest.valeur - baseIndice) / baseIndice) * 10000) / 100;

        // Update bail
        await client.query(
          `UPDATE am_baux SET loyer_ht_actu = $1, loyer_annuel = $1,
           loyer_mensuel = $2, updated_at = now() WHERE id = $3`,
          [String(nouveauLoyer), String(Math.round(nouveauLoyer / 12 * 100) / 100), bail.id],
        );

        // Record audit trail
        await client.query(
          `INSERT INTO am_indexations (id, bail_id, date_application, ancien_loyer, nouveau_loyer,
           indice_base, indice_nouveau, type_indice, trimestre, taux_variation, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
          [
            randomUUID(),
            bail.id,
            new Date().toISOString().slice(0, 10),
            String(currentLoyer || baseLoyer),
            String(nouveauLoyer),
            String(baseIndice),
            String(latest.valeur),
            type,
            latestTrimestre,
            String(tauxVariation),
            `Indexation auto — ${type} ${latestTrimestre}: ${baseIndice} → ${latest.valeur} (${tauxVariation > 0 ? "+" : ""}${tauxVariation}%)`,
          ],
        );

        indexed++;
      } catch (err: any) {
        errors.push(`Bail ${bail.id}: ${err.message}`);
      }
    }

    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    logger.error("auto-index-am: transaction rolled back", { error: err.message });
    errors.push(`Transaction: ${err.message}`);
  } finally {
    client.release();
  }

  logger.info(`auto-index-am: ${indexed} baux indexés, ${skipped} ignorés`);
  return { indexed, skipped, errors };
}

// ─── Legacy GL functions (kept for backward compatibility) ──

/** @deprecated Use autoIndexBauxAM instead */
export async function autoIndexBaux(): Promise<{ indexed: number; errors: string[] }> {
  // Delegate to AM version
  const result = await autoIndexBauxAM();
  return { indexed: result.indexed, errors: result.errors };
}
