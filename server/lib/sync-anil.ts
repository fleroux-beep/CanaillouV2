/**
 * Service de synchronisation Carte des loyers ANIL.
 * Source: data.gouv.fr — CSV "Carte des loyers" par commune.
 * https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025
 *
 * Le CSV contient des loyers/m² charges comprises par commune (code INSEE).
 * On filtre sur les codes postaux des actifs en portefeuille.
 */
import { db } from "../db";
import { refValeursLocatives } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

// URL du CSV ANIL 2025 (dernier millésime disponible)
const ANIL_CSV_URL =
  "https://www.data.gouv.fr/fr/datasets/r/06543b16-5e18-4980-9bf8-dd49e3382fad";

interface AnilRow {
  codeInsee: string;
  commune: string;
  codePostal: string;
  loyerAppartMedian: number;
  loyerAppartBas: number;
  loyerAppartHaut: number;
  loyerMaisonMedian: number;
  loyerMaisonBas: number;
  loyerMaisonHaut: number;
}

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

export async function syncANIL(codesPostaux: string[]): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const now = new Date().toISOString().slice(0, 10);
  const cpSet = new Set(codesPostaux);

  try {
    const response = await fetch(ANIL_CSV_URL);
    if (!response.ok) {
      return { synced: 0, errors: [`ANIL CSV: HTTP ${response.status}`] };
    }

    const text = await response.text();
    const lines = text.split("\n");
    if (lines.length < 2) {
      return { synced: 0, errors: ["ANIL CSV: fichier vide"] };
    }

    // Parse header to find column indices
    const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
    const iCodeInsee = header.findIndex((h) => h.includes("code") && (h.includes("insee") || h.includes("commune")));
    const iCommune = header.findIndex((h) => h === "commune" || h === "nom_commune" || h === "libgeo");
    const iCodePostal = header.findIndex((h) => h.includes("code_postal") || h.includes("codepostal") || h.includes("code postal"));
    // loyer columns — ANIL uses various naming conventions
    const iLoyerAppart = header.findIndex((h) => h.includes("loyer") && h.includes("appart") && (h.includes("pred") || h.includes("median") || h.includes("ref")));
    const iLoyerMaison = header.findIndex((h) => h.includes("loyer") && h.includes("maison") && (h.includes("pred") || h.includes("median") || h.includes("ref")));

    // Fallback: find any loyer columns by position
    const loyerCols = header.reduce((acc, h, i) => {
      if (h.includes("loyer") || h.includes("pred")) acc.push(i);
      return acc;
    }, [] as number[]);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      const codeInsee = iCodeInsee >= 0 ? cols[iCodeInsee] : "";
      const commune = iCommune >= 0 ? cols[iCommune] : "";

      // Try to match by code postal if available, or derive from code INSEE (first 5 chars for communes)
      let cp = iCodePostal >= 0 ? cols[iCodePostal] : "";
      if (!cp && codeInsee && codeInsee.length === 5) {
        cp = codeInsee; // For many communes, code INSEE = code postal
      }

      if (!cp || !cpSet.has(cp)) continue;

      // Parse loyer values
      const loyerAppart = iLoyerAppart >= 0 ? parseNum(cols[iLoyerAppart]) : (loyerCols.length > 0 ? parseNum(cols[loyerCols[0]]) : 0);
      const loyerMaison = iLoyerMaison >= 0 ? parseNum(cols[iLoyerMaison]) : (loyerCols.length > 1 ? parseNum(cols[loyerCols[1]]) : 0);

      // Insert appartement data
      if (loyerAppart > 0) {
        await db.delete(refValeursLocatives).where(
          and(
            eq(refValeursLocatives.source, "anil"),
            eq(refValeursLocatives.codePostal, cp),
            eq(refValeursLocatives.typeBien, "appartement"),
          ),
        );
        await db.insert(refValeursLocatives).values({
          source: "anil",
          codePostal: cp,
          ville: commune,
          codeInsee,
          typeBien: "appartement",
          loyerM2MensuelMedian: String(loyerAppart),
          periode: "2025",
          dateReleve: now,
        });
        synced++;
      }

      // Insert maison data
      if (loyerMaison > 0) {
        await db.delete(refValeursLocatives).where(
          and(
            eq(refValeursLocatives.source, "anil"),
            eq(refValeursLocatives.codePostal, cp),
            eq(refValeursLocatives.typeBien, "maison"),
          ),
        );
        await db.insert(refValeursLocatives).values({
          source: "anil",
          codePostal: cp,
          ville: commune,
          codeInsee,
          typeBien: "maison",
          loyerM2MensuelMedian: String(loyerMaison),
          periode: "2025",
          dateReleve: now,
        });
        synced++;
      }
    }
  } catch (err: any) {
    errors.push(`ANIL: ${err.message}`);
    logger.error("sync-anil error", { error: err.message });
  }

  logger.info("sync-anil completed", { synced, errors: errors.length });
  return { synced, errors };
}
