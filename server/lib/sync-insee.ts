/**
 * Axe 2 — Indexation automatique INSEE
 *
 * Récupère automatiquement les indices INSEE (IRL, ILC, ILAT, ICC)
 * depuis l'API publique INSEE (SDMX) et les stocke en base.
 * Déclenche l'indexation automatique des baux GL après mise à jour.
 */
import { db } from "../db";
import { indices, bauxGL, indexationsGL } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";

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
 * The API always returns XML (SDMX StructureSpecificData), regardless of Accept header.
 */
async function fetchInseeSeriesValues(seriesId: string): Promise<InseeValue[]> {
  // Primary URL: BDM V1 SDMX endpoint
  const urls = [
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}?lastNObservations=12`,
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
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
      logger.warn(`INSEE API returned XML but no parseable observations for series ${seriesId}, response length: ${text.length}`);
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
 * Attribute order may vary between series — parse each <Obs> independently.
 */
function parseInseeXmlResponse(text: string): InseeValue[] {
  const values: InseeValue[] = [];
  // Match each <Obs .../> or <Obs ...>...</Obs> element
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

/**
 * Synchronise les indices INSEE et les stocke en base.
 * Retourne le nombre d'indices mis à jour.
 */
export async function syncIndicesINSEE(): Promise<{ synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];

  for (const [type, { seriesId, label }] of Object.entries(INSEE_SERIES)) {
    try {
      const values = await fetchInseeSeriesValues(seriesId);
      if (values.length === 0) {
        errors.push(`${type}: aucune donnée récupérée`);
        continue;
      }

      // Get existing indices for this type
      const existing = await db.select().from(indices).where(eq(indices.type, type));
      const existingMap = new Map(existing.map((e) => [e.trimestre, e]));

      for (const v of values) {
        if (!existingMap.has(v.trimestre)) {
          await db.insert(indices).values({
            type,
            trimestre: v.trimestre,
            valeur: String(v.valeur),
          });
          synced++;
        }
      }

      const newForType = values.filter((v) => !existingMap.has(v.trimestre)).length;
      logger.info(`sync-insee: ${type} — ${values.length} valeurs récupérées, ${newForType} nouvelles insérées`);
    } catch (err: any) {
      errors.push(`${type}: ${err.message}`);
      logger.error(`sync-insee: erreur pour ${type}`, { error: err.message });
    }
  }

  return { synced, errors };
}

/**
 * Détermine l'indice par défaut selon le type de bail :
 *   - habitation → ICC (Indice du Coût de la Construction)
 *   - commercial, professionnel, derogatoire → ILC (Indice des Loyers Commerciaux)
 */
function defaultIndiceForType(typeBail: string | null): string {
  if (typeBail === "habitation") return "ICC";
  return "ILC";
}

/**
 * Assigne automatiquement l'indice de référence et la valeur de base
 * aux baux qui n'en ont pas encore.
 * Règle métier : habitation → ICC, commercial/crèche/professionnel → ILC.
 */
export async function assignDefaultIndices(): Promise<{ assigned: number; errors: string[] }> {
  let assigned = 0;
  const errors: string[] = [];

  const allBaux = await db.select().from(bauxGL)
    .where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt)));
  const allIndices = await db.select().from(indices);

  // Build map: type → latest index
  const latestByType = new Map<string, { trimestre: string; valeur: number }>();
  for (const idx of allIndices) {
    const existing = latestByType.get(idx.type);
    if (!existing || idx.trimestre.localeCompare(existing.trimestre) > 0) {
      latestByType.set(idx.type, { trimestre: idx.trimestre, valeur: Number(idx.valeur) });
    }
  }

  for (const bail of allBaux) {
    try {
      if (bail.forceManual) continue;
      // Skip baux that already have an indiceReference set
      if (bail.indiceReference) continue;

      const indiceType = defaultIndiceForType(bail.typeBail);
      const latest = latestByType.get(indiceType);
      if (!latest) continue; // No index data available yet

      await db.update(bauxGL)
        .set({
          indiceReference: indiceType,
          trimestreRef: latest.trimestre,
          valeurIndiceBase: String(latest.valeur),
          updatedAt: new Date(),
        })
        .where(eq(bauxGL.id, bail.id));

      assigned++;
      logger.info(`assign-default-indices: bail "${bail.nom || bail.id}" → ${indiceType} (${latest.trimestre} = ${latest.valeur})`);
    } catch (err: any) {
      errors.push(`Bail ${bail.nom || bail.id}: ${err.message}`);
    }
  }

  logger.info(`assign-default-indices: ${assigned} baux mis à jour`);
  return { assigned, errors };
}

/**
 * Applique l'indexation automatique sur tous les baux GL éligibles.
 * Un bail est éligible si :
 * - Il a un indiceReference (IRL, ILC, ILAT, ICC)
 * - Il a un loyerBaseHT
 * - Il a une valeurIndiceBase
 * - Un indice plus récent est disponible
 */
export async function autoIndexBaux(): Promise<{ indexed: number; errors: string[] }> {
  let indexed = 0;
  const errors: string[] = [];

  const allBaux = await db.select().from(bauxGL)
    .where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt)));
  const allIndices = await db.select().from(indices);

  for (const bail of allBaux) {
    try {
      if (!bail.indiceReference || !bail.loyerBaseHT || !bail.valeurIndiceBase) continue;
      if (bail.forceManual) continue; // Skip manually managed leases

      const type = bail.indiceReference;
      const baseLoyer = Number(bail.loyerBaseHT);
      const baseIndice = Number(bail.valeurIndiceBase);
      if (baseLoyer <= 0 || baseIndice <= 0) continue;

      // Find the latest indice for this type
      const typeIndices = allIndices
        .filter((i) => i.type === type)
        .sort((a, b) => b.trimestre.localeCompare(a.trimestre));

      if (typeIndices.length === 0) continue;

      const latest = typeIndices[0];
      const latestValeur = Number(latest.valeur);

      // Calculate new rent: loyerBase × (indiceNouveau / indiceBase)
      const nouveauLoyer = baseLoyer * (latestValeur / baseIndice);
      const currentLoyer = Number(bail.loyerHTActu || 0);

      // Only update if there's a meaningful change (> 0.01 EUR)
      if (Math.abs(nouveauLoyer - currentLoyer) < 0.01) continue;

      // Update the bail
      await db.update(bauxGL)
        .set({
          loyerHTActu: String(Math.round(nouveauLoyer * 100) / 100),
          updatedAt: new Date(),
        })
        .where(eq(bauxGL.id, bail.id));

      // Record indexation history
      const tauxVariation = ((latestValeur - baseIndice) / baseIndice) * 100;
      await db.insert(indexationsGL).values({
        bailId: bail.id,
        dateApplication: new Date().toISOString().slice(0, 10),
        ancienLoyer: String(currentLoyer || baseLoyer),
        nouveauLoyer: String(Math.round(nouveauLoyer * 100) / 100),
        indiceBase: String(baseIndice),
        indiceNouveau: String(latestValeur),
        typeIndice: type,
        tauxVariation: String(Math.round(tauxVariation * 100) / 100),
        notes: `Indexation auto — ${type} ${latest.trimestre}: ${baseIndice} → ${latestValeur}`,
      });

      indexed++;
    } catch (err: any) {
      errors.push(`Bail ${bail.nom || bail.id}: ${err.message}`);
    }
  }

  logger.info(`auto-index: ${indexed} baux indexés`);
  return { indexed, errors };
}
