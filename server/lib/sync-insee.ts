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
 */
async function fetchInseeSeriesValues(seriesId: string): Promise<InseeValue[]> {
  const url = `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${seriesId}?lastNObservations=12`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // Fallback: try without header
      const response2 = await fetch(url);
      if (!response2.ok) {
        throw new Error(`INSEE API returned ${response2.status}`);
      }
      return parseInseeResponse(await response2.text());
    }

    const data = await response.json();
    return parseInseeJsonResponse(data);
  } catch (err: any) {
    logger.warn(`INSEE API fetch failed for series ${seriesId}: ${err.message}`);
    return [];
  }
}

function parseInseeJsonResponse(data: any): InseeValue[] {
  const values: InseeValue[] = [];
  try {
    const observations = data?.dataSets?.[0]?.series?.["0:0:0:0"]?.observations || {};
    const timePeriods = data?.structure?.dimensions?.observation?.[0]?.values || [];

    for (const [idx, obs] of Object.entries(observations) as any) {
      const period = timePeriods[Number(idx)]?.id;
      const val = obs?.[0];
      if (period && val != null) {
        // Convert "2025-Q1" to "T1-2025"
        const trimestre = convertPeriod(period);
        if (trimestre) {
          values.push({ trimestre, valeur: Number(val) });
        }
      }
    }
  } catch {
    // parsing error
  }
  return values;
}

function parseInseeResponse(text: string): InseeValue[] {
  // Simple XML/text parsing fallback
  const values: InseeValue[] = [];
  const obsPattern = /TIME_PERIOD[^>]*value="([^"]+)"[^>]*>.*?OBS_VALUE[^>]*value="([^"]+)"/gs;
  let match;
  while ((match = obsPattern.exec(text)) !== null) {
    const trimestre = convertPeriod(match[1]);
    if (trimestre) {
      values.push({ trimestre, valeur: Number(match[2]) });
    }
  }
  return values;
}

function convertPeriod(period: string): string | null {
  // "2025-Q1" → "T1-2025" or "2025-T1" → "T1-2025"
  const m = period.match(/(\d{4})-Q(\d)/);
  if (m) return `T${m[2]}-${m[1]}`;
  const m2 = period.match(/(\d{4})-T(\d)/);
  if (m2) return `T${m2[2]}-${m2[1]}`;
  // Already in "T1-2025" format
  if (/^T\d-\d{4}$/.test(period)) return period;
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

      logger.info(`sync-insee: ${type} — ${values.length} valeurs, ${synced} nouvelles`);
    } catch (err: any) {
      errors.push(`${type}: ${err.message}`);
      logger.error(`sync-insee: erreur pour ${type}`, { error: err.message });
    }
  }

  return { synced, errors };
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
