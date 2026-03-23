/**
 * Service de synchronisation DVF (Demandes de Valeurs Foncières).
 * Source: fichiers CSV par commune — https://files.data.gouv.fr/geo-dvf/latest/csv/
 * Récupère les prix/m² par code postal et type de bien.
 *
 * On télécharge les CSV par code_commune (INSEE) pour les 2 dernières années
 * disponibles, puis on agrège les prix/m² par type de bien.
 */
import { db } from "../db";
import { refValeursVenales } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { resolveAllInsee } from "./code-postal-insee";

const DVF_BASE = "https://files.data.gouv.fr/geo-dvf/latest/csv";

function mapTypeDVF(typeLocal: string): string | null {
  const t = (typeLocal || "").toLowerCase().trim();
  if (t === "appartement") return "appartement";
  if (t === "maison") return "maison";
  if (t.includes("local") && t.includes("commercial")) return "local_commercial";
  if (t.includes("local") && (t.includes("activit") || t.includes("industriel"))) return "local_commercial";
  if (t === "dépendance") return null;
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

/** Parse a single CSV line handling quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

interface ParsedMutation {
  valeurFonciere: number;
  surfaceReelleBati: number;
  typeLocal: string;
  codePostal: string;
  nomCommune: string;
  codeCommune: string;
}

function parseDvfCsv(csvText: string): ParsedMutation[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idx = {
    valeurFonciere: header.indexOf("valeur_fonciere"),
    surfaceReelleBati: header.indexOf("surface_reelle_bati"),
    typeLocal: header.indexOf("type_local"),
    codePostal: header.indexOf("code_postal"),
    nomCommune: header.indexOf("nom_commune"),
    codeCommune: header.indexOf("code_commune"),
    natureMutation: header.indexOf("nature_mutation"),
  };

  const results: ParsedMutation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);

    // Only "Vente" mutations
    if (idx.natureMutation >= 0 && cols[idx.natureMutation] !== "Vente") continue;

    const valeurFonciere = parseFloat(cols[idx.valeurFonciere]) || 0;
    const surfaceReelleBati = parseFloat(cols[idx.surfaceReelleBati]) || 0;
    const typeLocal = cols[idx.typeLocal] || "";

    if (!valeurFonciere || !surfaceReelleBati || surfaceReelleBati < 5) continue;
    if (!typeLocal) continue;

    results.push({
      valeurFonciere,
      surfaceReelleBati,
      typeLocal,
      codePostal: cols[idx.codePostal] || "",
      nomCommune: cols[idx.nomCommune] || "",
      codeCommune: cols[idx.codeCommune] || "",
    });
  }
  return results;
}

export async function syncDVF(
  actifPairs: { codePostal: string; ville: string }[],
): Promise<{ synced: number; errors: string[] }> {
  let synced = 0;
  const errors: string[] = [];
  const now = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  // Fetch years: current and previous (DVF data is typically 6-12 months behind)
  const years = [currentYear - 1, currentYear - 2];

  // Resolve correct INSEE codes using geo.api.gouv.fr + ville name
  const { inseeToCP, allInsee } = await resolveAllInsee(actifPairs);

  for (const codeInsee of allInsee) {
    const cp = inseeToCP[codeInsee];
    const dept = codeInsee.slice(0, 2);

    // Aggregate mutations from multiple years
    const allMutations: ParsedMutation[] = [];

    for (const year of years) {
      try {
        const url = `${DVF_BASE}/${year}/communes/${dept}/${codeInsee}.csv`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

        if (response.status === 404) {
          // No data for this commune/year — normal for small communes or recent years
          continue;
        }
        if (!response.ok) {
          errors.push(`DVF ${cp} (${year}): HTTP ${response.status}`);
          continue;
        }

        const csvText = await response.text();
        const mutations = parseDvfCsv(csvText);
        allMutations.push(...mutations);
      } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          errors.push(`DVF ${cp} (${year}): timeout`);
        } else {
          errors.push(`DVF ${cp} (${year}): ${err.message}`);
        }
      }
    }

    if (allMutations.length === 0) continue;

    // Group by type_bien
    const byType: Record<string, { prixM2: number[]; ville: string }> = {};

    for (const m of allMutations) {
      const typeBien = mapTypeDVF(m.typeLocal);
      if (!typeBien) continue;

      const prixM2 = m.valeurFonciere / m.surfaceReelleBati;
      if (prixM2 < 100 || prixM2 > 50000) continue; // filter outliers

      if (!byType[typeBien]) {
        byType[typeBien] = { prixM2: [], ville: m.nomCommune || "" };
      }
      byType[typeBien].prixM2.push(prixM2);
    }

    // Upsert by code_postal + type_bien
    const periode = years.join("-");
    for (const [typeBien, aggData] of Object.entries(byType)) {
      if (aggData.prixM2.length < 3) continue; // not enough data

      const prixMedian = Math.round(median(aggData.prixM2));
      const prixBas = Math.round(quartile(aggData.prixM2, 0.25));
      const prixHaut = Math.round(quartile(aggData.prixM2, 0.75));

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
        ville: aggData.ville,
        codeInsee,
        typeBien,
        prixM2Median: String(prixMedian),
        prixM2Bas: String(prixBas),
        prixM2Haut: String(prixHaut),
        nbTransactions: aggData.prixM2.length,
        periode,
        dateReleve: now,
      });
      synced++;
    }
  }

  logger.info("sync-dvf completed", { synced, errors: errors.length });
  return { synced, errors };
}
