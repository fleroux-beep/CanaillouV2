/**
 * Service de synchronisation DVF (Demandes de Valeurs Foncières).
 * Source: API DVF Etalab — https://api.cquest.org/dvf
 * Récupère les prix/m² par code postal et type de bien.
 */
import { db } from "../db";
import { refValeursVenales } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

const DVF_API = "https://api.cquest.org/dvf";

interface DVFMutation {
  valeur_fonciere: number;
  surface_reelle_bati: number;
  type_local: string;
  code_postal: string;
  nom_commune: string;
  code_commune: string;
  date_mutation: string;
}

function mapTypeDVF(typeLocal: string): string | null {
  const t = (typeLocal || "").toLowerCase();
  if (t.includes("appartement")) return "appartement";
  if (t.includes("maison")) return "maison";
  if (t.includes("local") && t.includes("commercial")) return "local_commercial";
  if (t.includes("local") && (t.includes("activit") || t.includes("industriel"))) return "local_commercial";
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quartile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export async function syncDVF(codesPostaux: string[]): Promise<{ synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];
  const now = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const periode = `${year - 1}-${year}`;

  for (const cp of codesPostaux) {
    try {
      // Fetch last 18 months of transactions
      const url = `${DVF_API}?code_postal=${cp}&nature_mutation=Vente`;
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`DVF ${cp}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json() as { resultats?: DVFMutation[] };
      const mutations = data.resultats || [];

      // Group by type_bien
      const byType: Record<string, { prixM2: number[]; ville: string; codeInsee: string }> = {};

      for (const m of mutations) {
        if (!m.valeur_fonciere || !m.surface_reelle_bati || m.surface_reelle_bati < 5) continue;
        const typeBien = mapTypeDVF(m.type_local);
        if (!typeBien) continue;

        const prixM2 = m.valeur_fonciere / m.surface_reelle_bati;
        if (prixM2 < 100 || prixM2 > 50000) continue; // filter outliers

        if (!byType[typeBien]) {
          byType[typeBien] = { prixM2: [], ville: m.nom_commune || "", codeInsee: m.code_commune || "" };
        }
        byType[typeBien].prixM2.push(prixM2);
      }

      // Upsert by code_postal + type_bien
      for (const [typeBien, data] of Object.entries(byType)) {
        if (data.prixM2.length < 3) continue; // not enough data

        const prixMedian = Math.round(median(data.prixM2));
        const prixBas = Math.round(quartile(data.prixM2, 0.25));
        const prixHaut = Math.round(quartile(data.prixM2, 0.75));

        // Delete existing DVF entry for this cp+type, then insert fresh
        await db.delete(refValeursVenales).where(
          and(
            eq(refValeursVenales.source, "dvf"),
            eq(refValeursVenales.codePostal, cp),
            eq(refValeursVenales.typeBien, typeBien),
          ),
        );

        await db.insert(refValeursVenales).values({
          source: "dvf",
          codePostal: cp,
          ville: data.ville,
          codeInsee: data.codeInsee,
          typeBien,
          prixM2Median: String(prixMedian),
          prixM2Bas: String(prixBas),
          prixM2Haut: String(prixHaut),
          nbTransactions: data.prixM2.length,
          periode,
          dateReleve: now,
        });
        synced++;
      }
    } catch (err: any) {
      errors.push(`DVF ${cp}: ${err.message}`);
      logger.error("sync-dvf error", { cp, error: err.message });
    }
  }

  logger.info("sync-dvf completed", { synced, errors: errors.length });
  return { synced, errors };
}
