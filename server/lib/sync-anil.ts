/**
 * Service de synchronisation Carte des loyers ANIL.
 * Source: data.gouv.fr — CSV "Carte des loyers" par commune (2025).
 *
 * Deux fichiers distincts :
 *  - Appartements : loypredm2, lwr.IPm2, upr.IPm2
 *  - Maisons      : loypredm2, lwr.IPm2, upr.IPm2
 *
 * Colonnes clés : INSEE_C (code INSEE), LIBGEO (commune), loypredm2 (loyer prédit/m²),
 * lwr.IPm2 (borne basse), upr.IPm2 (borne haute). Séparateur: ";". Décimale: ",".
 */
import { db } from "../db";
import { refValeursLocatives } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { codePostalToInsee, inseeToCodePostal } from "./code-postal-insee";

// Resource IDs for "Carte des loyers 2025" on data.gouv.fr
const ANIL_APPART_URL =
  "https://www.data.gouv.fr/fr/datasets/r/55b34088-0964-415f-9df7-d87dd98a09be";
const ANIL_MAISON_URL =
  "https://www.data.gouv.fr/fr/datasets/r/129f764d-b613-44e4-952c-5ff50a8c9b73";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ";" && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseNum(v: string): number {
  if (!v || v === "NA" || v === "." || v === "") return 0;
  return parseFloat(v.replace(",", ".")) || 0;
}

interface AnilRecord {
  codeInsee: string;
  commune: string;
  loyerMedian: number;
  loyerBas: number;
  loyerHaut: number;
}

function parseAnilCsv(csvText: string): AnilRecord[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  // Column indices — actual column names from data.gouv.fr 2025 dataset
  const iCodeInsee = header.findIndex((h) => h === "insee_c" || h === "codgeo" || (h.includes("insee") && h.includes("c")));
  const iCommune = header.findIndex((h) => h === "libgeo" || h === "commune" || h === "nom_commune");
  const iLoyerMedian = header.findIndex((h) => h === "loypredm2" || h.includes("loypred"));
  const iLoyerBas = header.findIndex((h) => h === "lwr.ipm2" || h.startsWith("lwr"));
  const iLoyerHaut = header.findIndex((h) => h === "upr.ipm2" || h.startsWith("upr"));

  if (iCodeInsee < 0 || iLoyerMedian < 0) {
    logger.warn("ANIL CSV: colonnes introuvables", {
      header: header.slice(0, 15).join(", "),
      iCodeInsee,
      iLoyerMedian,
    });
    return [];
  }

  const records: AnilRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const codeInsee = cols[iCodeInsee] || "";
    const commune = iCommune >= 0 ? cols[iCommune] : "";
    const loyerMedian = parseNum(cols[iLoyerMedian]);
    const loyerBas = iLoyerBas >= 0 ? parseNum(cols[iLoyerBas]) : 0;
    const loyerHaut = iLoyerHaut >= 0 ? parseNum(cols[iLoyerHaut]) : 0;

    if (!codeInsee || loyerMedian <= 0) continue;

    records.push({ codeInsee, commune, loyerMedian, loyerBas, loyerHaut });
  }

  return records;
}

async function fetchCsv(url: string, label: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    if (!response.ok) {
      logger.error(`ANIL ${label}: HTTP ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err: any) {
    logger.error(`ANIL ${label}: ${err.message}`);
    return null;
  }
}

export async function syncANIL(codesPostaux: string[]): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const now = new Date().toISOString().slice(0, 10);

  // Build a set of code_insee values that correspond to our code_postal list
  const cpByInsee: Record<string, string> = {};
  for (const cp of codesPostaux) {
    for (const insee of codePostalToInsee(cp)) {
      cpByInsee[insee] = cp;
    }
  }

  // Fetch and process appartements
  const appart = await fetchAndSync("appartement", ANIL_APPART_URL, cpByInsee, now, errors);
  synced += appart;

  // Fetch and process maisons
  const maison = await fetchAndSync("maison", ANIL_MAISON_URL, cpByInsee, now, errors);
  synced += maison;

  logger.info("sync-anil completed", { synced, errors: errors.length });
  return { synced, errors };
}

async function fetchAndSync(
  typeBien: string,
  url: string,
  cpByInsee: Record<string, string>,
  now: string,
  errors: string[],
): Promise<number> {
  let synced = 0;

  const csvText = await fetchCsv(url, typeBien);
  if (!csvText) {
    errors.push(`ANIL ${typeBien}: impossible de télécharger le CSV`);
    return 0;
  }

  const records = parseAnilCsv(csvText);
  if (records.length === 0) {
    errors.push(`ANIL ${typeBien}: aucune donnée valide dans le CSV`);
    return 0;
  }

  logger.info(`ANIL ${typeBien}: ${records.length} lignes parsées, recherche parmi ${Object.keys(cpByInsee).length} codes INSEE`);

  for (const rec of records) {
    // Match by code_insee
    let cp = cpByInsee[rec.codeInsee];

    // Also try matching if code_insee looks like a code_postal directly
    if (!cp) {
      const derivedCp = inseeToCodePostal(rec.codeInsee);
      if (cpByInsee[derivedCp]) {
        cp = cpByInsee[derivedCp];
      }
    }

    if (!cp) continue;

    try {
      // Delete existing ANIL entry for this cp+type, then insert fresh
      await db.delete(refValeursLocatives).where(
        and(
          eq(refValeursLocatives.source, "anil"),
          eq(refValeursLocatives.codePostal, cp),
          eq(refValeursLocatives.typeBien, typeBien),
        ),
      );

      await db.insert(refValeursLocatives).values({
        source: "anil",
        codePostal: cp,
        ville: rec.commune,
        codeInsee: rec.codeInsee,
        typeBien,
        loyerM2MensuelMedian: String(rec.loyerMedian.toFixed(2)),
        loyerM2MensuelBas: rec.loyerBas > 0 ? String(rec.loyerBas.toFixed(2)) : null,
        loyerM2MensuelHaut: rec.loyerHaut > 0 ? String(rec.loyerHaut.toFixed(2)) : null,
        periode: "2025",
        dateReleve: now,
      });
      synced++;
    } catch (err: any) {
      errors.push(`ANIL ${typeBien} ${cp}: ${err.message}`);
    }
  }

  return synced;
}
