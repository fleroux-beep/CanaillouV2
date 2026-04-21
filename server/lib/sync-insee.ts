/**
 * Axe 2 — Indexation automatique INSEE
 *
 * Récupère automatiquement les indices INSEE (IRL, ILC, ILAT, ICC)
 * depuis l'API publique INSEE (SDMX) et les stocke en base.
 * Déclenche l'indexation automatique des baux GL après mise à jour.
 */
import { db } from "../db";
import { pool } from "../db";
import { indices, bauxGL, indexationsGL, syncLogs } from "@shared/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { logger } from "./logger";

// ─── INSEE SDMX API ────────────────────────────────────────

// Mapping indices → séries INSEE (identifiants SDMX)
// IDs vérifiés en avril 2026 contre api.insee.fr/series/BDM/V1/data/SERIES_BDM/.
// Historique des bugs corrigés :
//   - ILC : l'ancien ID 001515926 pointait en fait vers "Taux de chômage
//     localisé par département — Orne" (≈ 7,5 %), ce qui expliquait la
//     valeur aberrante affichée dans l'UI. Le bon ID est 001532540
//     ("Indice des loyers commerciaux — Base 100 T1 2008").
//   - ILAT : l'ancien ID 001609810 a été déprécié quand INSEE a rebasé
//     l'indice. La série courante "Base 100 au 1er trimestre 2010" est 001617112.
const INSEE_SERIES: Record<string, { seriesId: string; label: string }> = {
  IRL: { seriesId: "001515333", label: "Indice de Référence des Loyers" },
  ILC: { seriesId: "001532540", label: "Indice des Loyers Commerciaux" },
  ILAT: { seriesId: "001617112", label: "Indice des Loyers des Activités Tertiaires" },
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
  const urls = [
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}?lastNObservations=12`,
    `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}`,
  ];

  for (const url of urls) {
    // Retry with exponential backoff (3 attempts: 0s, 2s, 4s)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          logger.warn(`INSEE API returned ${response.status} for ${url} (attempt ${attempt + 1})`);
          if (response.status >= 500) continue; // retry on server error
          break; // 4xx = don't retry this URL
        }

        const text = await response.text();
        const values = parseInseeXmlResponse(text);
        if (values.length > 0) {
          return values;
        }
        logger.warn(`INSEE API returned XML but no parseable observations for series ${seriesId}, response length: ${text.length}`);
        break; // parsing issue, try next URL
      } catch (err: any) {
        logger.warn(`INSEE API fetch failed for series ${seriesId} (${url}, attempt ${attempt + 1}): ${err.message}`);
        if (attempt === 2) break; // exhausted retries for this URL
      }
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
  // Advisory lock to prevent concurrent syncs (lock ID = hashCode("insee-sync"))
  const LOCK_ID = 738291;
  const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_ID})`);
  const gotLock = (lockResult as any).rows?.[0]?.pg_try_advisory_lock;
  if (!gotLock) {
    logger.warn("sync-insee: another sync is already running, skipping");
    return { synced: 0, errors: ["Synchronisation déjà en cours"] };
  }

  let synced = 0;
  const errors: string[] = [];

  for (const [type, { seriesId, label }] of Object.entries(INSEE_SERIES)) {
    try {
      const values = await fetchInseeSeriesValues(seriesId);
      if (values.length === 0) {
        // Important: surface this prominently — previously a silent warn,
        // it was hiding cases where ILAT (or any other index) never syncs.
        const msg = `${type} (${label}): aucune donnée récupérée depuis l'API INSEE (séries ${seriesId})`;
        errors.push(msg);
        logger.error(`sync-insee: ${msg}`);
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

  // Release advisory lock
  await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_ID})`);

  // Record sync log
  try {
    await db.insert(syncLogs).values({
      type: "insee",
      status: errors.length > 0 ? (synced > 0 ? "partial" : "error") : "success",
      syncedCount: synced,
      errorCount: errors.length,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      endedAt: new Date(),
    });
  } catch (logErr: any) {
    logger.warn("sync-insee: failed to record sync log", { error: logErr.message });
  }

  return { synced, errors };
}

/**
 * Détermine l'indice par défaut selon le type de bail.
 * Règles légales françaises :
 *   - habitation / logement / résidentiel → IRL (obligatoire depuis 2006,
 *     art. 17-1 loi du 6 juillet 1989)
 *   - bureau / professionnel / tertiaire → ILAT (art. L.112-2 du Code monétaire
 *     et financier ; obligatoire depuis 2022 pour les baux professionnels)
 *   - commercial / boutique / crèche / commerce → ILC (depuis 2008)
 *   - construction / chantier → ICC (rare, baux industriels ou historiques)
 *
 * NB : l'ancien code mappait habitation → ICC, ce qui était illégal —
 * l'ICC ne peut plus être utilisé pour revaloriser un loyer d'habitation
 * depuis 2006 (et pour le commercial depuis 2013).
 */
function defaultIndiceForType(typeBail: string | null): string | null {
  if (!typeBail) return null;
  const normalized = typeBail
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/(habitation|logement|residentiel|resid)/.test(normalized)) return "IRL";
  if (/(tertiaire|bureau|professionnel|prof)/.test(normalized)) return "ILAT";
  if (/(commercial|boutique|creche|commerce|derogatoire)/.test(normalized)) return "ILC";
  if (/(construction|chantier|industriel)/.test(normalized)) return "ICC";
  return null;
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
      if (!indiceType) continue; // typeBail inconnu — laisser à la saisie manuelle
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
export async function autoIndexBaux(): Promise<{
  indexed: number;
  errors: string[];
  skipped: { bail: string; reason: string }[];
}> {
  let indexed = 0;
  const errors: string[] = [];
  const skipped: { bail: string; reason: string }[] = [];

  const allBaux = await db.select().from(bauxGL)
    .where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt)));
  const allIndices = await db.select().from(indices);

  for (const bail of allBaux) {
    const bailLabel = bail.nom || bail.id;
    try {
      if (!bail.indiceReference) {
        skipped.push({ bail: bailLabel, reason: "indiceReference manquant" });
        continue;
      }
      if (!bail.loyerBaseHT) {
        skipped.push({ bail: bailLabel, reason: "loyerBaseHT manquant" });
        continue;
      }
      if (!bail.valeurIndiceBase) {
        skipped.push({ bail: bailLabel, reason: "valeurIndiceBase manquante" });
        continue;
      }
      if (bail.forceManual) {
        skipped.push({ bail: bailLabel, reason: "forceManual activé (gestion manuelle)" });
        continue;
      }

      const type = bail.indiceReference;
      const baseLoyer = Number(bail.loyerBaseHT);
      const baseIndice = Number(bail.valeurIndiceBase);
      if (baseLoyer <= 0 || baseIndice <= 0) {
        skipped.push({ bail: bailLabel, reason: `valeurs invalides (loyer=${baseLoyer}, indice=${baseIndice})` });
        continue;
      }

      // Find the latest indice for this type
      const typeIndices = allIndices
        .filter((i) => i.type === type)
        .sort((a, b) => b.trimestre.localeCompare(a.trimestre));

      if (typeIndices.length === 0) {
        skipped.push({ bail: bailLabel, reason: `aucun indice ${type} en base — sync INSEE requise` });
        continue;
      }

      const latest = typeIndices[0];
      const latestValeur = Number(latest.valeur);

      // Calculate new rent: loyerBase × (indiceNouveau / indiceBase)
      let nouveauLoyer = baseLoyer * (latestValeur / baseIndice);

      // Bornage légal IRL : l'augmentation annualisée ne peut excéder +3,5% (loi Climat
      // & bouclier loyer). On applique le plafond sur la variation cumulée depuis la
      // signature en prorata du nombre d'années écoulées. Hors IRL, pas de plafond légal.
      if (type === "IRL" && bail.dateDebut) {
        const yearsSinceStart = Math.max(
          1,
          (Date.now() - new Date(bail.dateDebut).getTime()) / (365.25 * 86400000),
        );
        const maxCumul = Math.pow(1.035, yearsSinceStart);
        const maxLoyer = baseLoyer * maxCumul;
        if (nouveauLoyer > maxLoyer) {
          logger.warn(
            `auto-index: IRL plafonné à +3,5%/an pour bail "${bailLabel}" — ` +
            `calculé ${nouveauLoyer.toFixed(2)}€ → plafonné ${maxLoyer.toFixed(2)}€`,
          );
          nouveauLoyer = maxLoyer;
        }
      }

      const currentLoyer = Number(bail.loyerHTActu || 0);

      // Only update if there's a meaningful change (> 0.01 EUR)
      if (Math.abs(nouveauLoyer - currentLoyer) < 0.01) {
        skipped.push({ bail: bailLabel, reason: `déjà à jour (${type} ${latest.trimestre} = ${latestValeur})` });
        continue;
      }

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

  logger.info(`auto-index: ${indexed} baux indexés, ${skipped.length} ignorés`);
  return { indexed, errors, skipped };
}

/**
 * Remplit valeurIndiceBase pour les baux qui ont un indiceReference + trimestreRef
 * mais pas de valeur numérique (le xlsx n'en contenait pas).
 * Cherche dans la table `indices` la valeur correspondante.
 */
export async function backfillBaseIndexValues(): Promise<{ filled: number }> {
  let filled = 0;
  const allBaux = await db.select().from(bauxGL)
    .where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt)));
  const allIndices = await db.select().from(indices);

  for (const bail of allBaux) {
    if (!bail.indiceReference || !bail.trimestreRef || bail.valeurIndiceBase) continue;

    const match = allIndices.find(
      (idx) => idx.type === bail.indiceReference && idx.trimestre === bail.trimestreRef
    );
    if (match && match.valeur) {
      await db.update(bauxGL)
        .set({ valeurIndiceBase: String(match.valeur) })
        .where(eq(bauxGL.id, bail.id));
      filled++;
    }
  }

  logger.info(`backfill: ${filled} baux received valeurIndiceBase from indices table`);
  return { filled };
}
