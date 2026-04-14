/**
 * Import script: reads the restructured Excel BDD file and inserts data into PostgreSQL.
 * Called via POST /api/admin/import-excel (requires admin auth).
 *
 * Source file: BDD_SCI_restructuree.xlsx
 * Sheets used: Patrimoine, Baux, Financement, Détention Capital, Emprunts Détaillés, P&L *
 *
 * Tables populated: am_scis, am_actifs, am_lots, am_emprunts,
 *                   am_associes, am_participations, gl_baux (scope='am'),
 *                   gl_locataires
 */
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { pool } from "./db";
import { logger } from "./lib/logger";
import { geocodeAddress } from "./lib/geocode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────────────────

function excelDateToISO(serial: number | string | null | undefined): string | null {
  if (serial == null || serial === "") return null;
  if (typeof serial === "string") {
    // Already a date-like string?
    if (/^\d{4}-\d{2}-\d{2}/.test(serial)) return serial.slice(0, 10);
    // "Vefa le 01/07/2022" → try to extract
    const m = serial.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  }
  const n = Number(serial);
  if (isNaN(n) || n < 1000) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function num(v: any): number | null {
  if (v == null || v === "" || v === "non trouvé") return null;
  const s = String(v).replace(/,/g, ".").replace(/[^\d.\-]/g, "");
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function str(v: any): string | null {
  if (v == null || v === "") return null;
  return String(v).trim();
}

function id(): string {
  return randomUUID();
}

// ── SCI name mapping ─────────────────────────────────────────────────

const SCI_FULL_NAMES: Record<string, string> = {
  "34 RUE HAUTE": "SCI 34 Rue Haute",
  "LEGRAND": "SCI Legrand",
  "ARMEE ORIENT": "SCI Armée d'Orient",
  "CHENNEVIERES": "SCI Chennevières",
  "TAVERNY": "SCI Taverny",
  "GENERAL JULES BRIMONT": "SCI Général Jules Brimont",
};

// Société code → SCI name (from Emprunts Détaillés)
const SOCIETE_TO_SCI: Record<string, string> = {
  "9-HAUTE": "34 RUE HAUTE",
  "9-LEGRAND": "LEGRAND",
  "9-ORIENT": "ARMEE ORIENT",
  "9-CHENNEVIERES": "CHENNEVIERES",
  "9-TAVERNY": "TAVERNY",
  "9-GJB": "GENERAL JULES BRIMONT",
};

// Sold SCIs to skip
const SOLD_SCIS = new Set(["HOCHE ERMONT", "MADELI", "22 RUE ARAGO"]);

// ── Data row interfaces ─────────────────────────────────────────────

interface PatrimoineRow {
  sciName: string;
  dateAcquisition: string | null;
  codePostal: string | null;
  ville: string | null;
  adresse: string | null;
  numLot: string | null;
  destination: string | null;
  surfaceTerrain: number | null;
  surfacesPrivatives: number | null;
  usage: string | null;
  copro: string | null;
  prixAcquisition: number | null;
  description: string | null;
  cadastre: string | null;
  statut: string | null;
}

interface BailRow {
  sciName: string;
  adresse: string | null;
  destination: string | null;
  typeBail: string | null;
  locataire: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  loyerAnnuelDepart: number | null;
  soumisTVA: string | null;
  indiceRevalorisation: string | null;
  loyerActuelHC: number | null;
  surfaceLouee: number | null;
}

interface FinancementRow {
  sciName: string;
  adresse: string | null;
  quotePartPrixAchat: number | null;
  apport: number | null;
  totalEmprunts: number | null;
  vo: number | null;
  vnc: number | null;
  quotePartEmprunt: number | null;
  empruntRestantFin2025: number | null;
  banques: string | null;
  garantie: string | null;
  duree: string | null;
  dateFinEmprunt: string | null;
  tauxInteret: string | null;
  tauxAssurance: string | null;
  tauxIRA: string | null;
  comptesCourants: number | null;
}

interface DetentionRow {
  sciName: string;
  damien: number;
  sebastien: number;
  hio: number;
  axoriel: number;
  demembrement: string | null;
}

interface EmpruntDetailRow {
  nomPret: string;
  societe: string;
  banque: string;
  comptaNo: string | null;
  montant: number;
  taux: number;
  dateDebut: string | null;
  capitalRestantDu2025: number | null;
  echeanceAnnuelle2025: number | null;
  capitalRestantDu2026: number | null;
  echeanceAnnuelle2026: number | null;
  dureeTotaleAns: number | null; // derived from amortization schedule
  dateFin: string | null; // last year with significant payment → "YYYY-12-31"
}

// ── Parse combined "BDD" sheet (new format) ─────────────────────────
// The BDD sheet combines Patrimoine + Baux + Financement + Détention in one
// Row 0 = group headers, Row 1 = column headers, data starts at row 2

interface BDDResult {
  patrimoine: PatrimoineRow[];
  baux: BailRow[];
  financement: FinancementRow[];
  detention: DetentionRow[];
}

function parseBDDSheet(wb: XLSX.WorkBook): BDDResult {
  const sheet = wb.Sheets["BDD"];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const patrimoine: PatrimoineRow[] = [];
  const baux: BailRow[] = [];
  const financement: FinancementRow[] = [];
  const detentionMap: Record<string, DetentionRow> = {};

  // Data rows start at index 2 (row 0=group headers, row 1=column headers)
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    if (SOLD_SCIS.has(sciName)) continue;
    // Skip "VENDU" rows
    if (str(r[1]) === "VENDU") continue;

    // Patrimoine data
    patrimoine.push({
      sciName,
      dateAcquisition: excelDateToISO(r[1]),
      codePostal: str(r[2]),
      ville: str(r[3]),
      adresse: str(r[4]),
      numLot: str(r[5]),
      destination: str(r[6]),
      surfaceTerrain: num(r[7]),
      surfacesPrivatives: num(r[8]),
      usage: str(r[9]),
      copro: str(r[10]),
      prixAcquisition: num(r[11]),
      description: str(r[12]),
      cadastre: str(r[13]),
      statut: null,
    });

    // Bail data (columns 14-22)
    baux.push({
      sciName,
      adresse: str(r[4]),
      destination: str(r[6]),
      typeBail: str(r[14]),
      locataire: str(r[15]),
      dateDebut: excelDateToISO(r[16]),
      dateFin: excelDateToISO(r[17]),
      loyerAnnuelDepart: num(r[18]),
      soumisTVA: str(r[19]),
      indiceRevalorisation: str(r[20]),
      loyerActuelHC: num(r[21]),
      surfaceLouee: num(r[22]),
    });

    // Financement data (columns 23-37)
    financement.push({
      sciName,
      adresse: str(r[4]),
      quotePartPrixAchat: num(r[23]),
      apport: num(r[24]),
      totalEmprunts: num(r[25]),
      vo: num(r[26]),
      vnc: num(r[27]),
      quotePartEmprunt: num(r[28]),
      empruntRestantFin2025: num(r[29]),
      banques: str(r[30]),
      garantie: str(r[31]),
      duree: str(r[32]),
      dateFinEmprunt: excelDateToISO(r[33]),
      tauxInteret: str(r[34]),
      tauxAssurance: str(r[35]),
      tauxIRA: str(r[36]),
      comptesCourants: num(r[37]),
    });

    // Détention capital (columns 38-41, 44=démembrement)
    if (!detentionMap[sciName]) {
      detentionMap[sciName] = {
        sciName,
        damien: num(r[38]) || 0,
        sebastien: num(r[39]) || 0,
        hio: num(r[40]) || 0,
        axoriel: num(r[41]) || 0,
        demembrement: str(r[44]),
      };
    }
  }

  return {
    patrimoine,
    baux,
    financement,
    detention: Object.values(detentionMap),
  };
}

// ── Fallback parsers for old format (separate sheets) ───────────────

function parsePatrimoine(wb: XLSX.WorkBook): PatrimoineRow[] {
  const sheet = wb.Sheets["Patrimoine"];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: PatrimoineRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    const statut = str(r[14]);
    if (statut === "VENDU" || SOLD_SCIS.has(sciName)) continue;

    rows.push({
      sciName,
      dateAcquisition: excelDateToISO(r[1]),
      codePostal: str(r[2]),
      ville: str(r[3]),
      adresse: str(r[4]),
      numLot: str(r[5]),
      destination: str(r[6]),
      surfaceTerrain: num(r[7]),
      surfacesPrivatives: num(r[8]),
      usage: str(r[9]),
      copro: str(r[10]),
      prixAcquisition: num(r[11]),
      description: str(r[12]),
      cadastre: str(r[13]),
      statut,
    });
  }
  return rows;
}

function parseBaux(wb: XLSX.WorkBook): BailRow[] {
  const sheet = wb.Sheets["Baux"];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: BailRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    if (SOLD_SCIS.has(sciName)) continue;

    rows.push({
      sciName,
      adresse: str(r[1]),
      destination: str(r[2]),
      typeBail: str(r[3]),
      locataire: str(r[4]),
      dateDebut: excelDateToISO(r[5]),
      dateFin: excelDateToISO(r[6]),
      loyerAnnuelDepart: num(r[7]),
      soumisTVA: str(r[8]),
      indiceRevalorisation: str(r[9]),
      loyerActuelHC: num(r[10]),
      surfaceLouee: num(r[11]),
    });
  }
  return rows;
}

function parseFinancement(wb: XLSX.WorkBook): FinancementRow[] {
  const sheet = wb.Sheets["Financement"];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: FinancementRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    if (SOLD_SCIS.has(sciName)) continue;

    rows.push({
      sciName,
      adresse: str(r[1]),
      quotePartPrixAchat: num(r[2]),
      apport: num(r[3]),
      totalEmprunts: num(r[4]),
      vo: num(r[5]),
      vnc: num(r[6]),
      quotePartEmprunt: num(r[7]),
      empruntRestantFin2025: num(r[8]),
      banques: str(r[9]),
      garantie: str(r[10]),
      duree: str(r[11]),
      dateFinEmprunt: excelDateToISO(r[12]),
      tauxInteret: str(r[13]),
      tauxAssurance: str(r[14]),
      tauxIRA: str(r[15]),
      comptesCourants: num(r[16]),
    });
  }
  return rows;
}

function parseDetention(wb: XLSX.WorkBook): DetentionRow[] {
  const sheet = wb.Sheets["Détention Capital"];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: DetentionRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    if (SOLD_SCIS.has(sciName)) continue;

    rows.push({
      sciName,
      damien: num(r[1]) || 0,
      sebastien: num(r[2]) || 0,
      hio: num(r[3]) || 0,
      axoriel: num(r[4]) || 0,
      demembrement: str(r[5]),
    });
  }
  return rows;
}

function parseEmpruntsDetailles(wb: XLSX.WorkBook): EmpruntDetailRow[] {
  // Try old format first ("Emprunts Détaillés"), then new format ("Emprunts")
  const oldSheet = wb.Sheets["Emprunts Détaillés"];
  const newSheet = wb.Sheets["Emprunts"];
  const sheet = oldSheet || newSheet;
  if (!sheet) return [];

  const isNewFormat = !oldSheet && !!newSheet;
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const emprunts: EmpruntDetailRow[] = [];

  // New format: data starts at row 3, old format: row 2
  const startRow = isNewFormat ? 3 : 2;

  // Year columns for deriving loan end date from payment schedule
  // New format: échéances at cols 9,11,13,15,17,19,21,23,...
  // Old format: échéances at cols 7,9,11,13,15,17,...
  const newYears =  [2020,2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,2042,2043];
  const newEchCols = [9,   11,  13,  15,  17,  19,  21,  23,  25,  27,  29,  31,  33,  35,  37,  39,  41,  43,  45,  47,  49,  51,  53,  55];
  const oldYears =  [2020,2021,2022,2023,2024,2025];
  const oldEchCols = [7,  9,   11,  13,  15,  17];

  const years = isNewFormat ? newYears : oldYears;
  const echCols = isNewFormat ? newEchCols : oldEchCols;

  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0] || String(r[0]) === "TOTAL") continue;

    const societe = str(r[1]) || "";
    if (societe.includes("HOCHE") || societe.includes("MADELI") || societe.includes("ARAGO")) continue;

    // Derive loan end date from the last year with a significant payment (> 100€)
    let lastPaymentYear = 0;
    for (let y = 0; y < years.length && y < echCols.length; y++) {
      const ech = num(r[echCols[y]]) || 0;
      if (ech > 100) lastPaymentYear = years[y];
    }

    const dateDebutCol = isNewFormat ? 7 : 6;
    const dateDebut = excelDateToISO(r[dateDebutCol]);

    // Calculate total loan duration from first payment to last
    let dureeTotaleAns: number | null = null;
    let dateFin: string | null = null;
    if (lastPaymentYear > 0) {
      dateFin = `${lastPaymentYear}-12-31`;
      if (dateDebut) {
        const startYear = new Date(dateDebut).getFullYear();
        dureeTotaleAns = lastPaymentYear - startYear + 1;
      }
    }

    if (isNewFormat) {
      emprunts.push({
        nomPret: str(r[0])!,
        societe,
        banque: str(r[2]) || "",
        comptaNo: str(r[4]),
        montant: num(r[5]) || 0,
        taux: num(r[6]) || 0,
        dateDebut,
        echeanceAnnuelle2025: num(r[19]),
        capitalRestantDu2025: num(r[20]),
        echeanceAnnuelle2026: num(r[21]),
        capitalRestantDu2026: num(r[22]),
        dureeTotaleAns,
        dateFin,
      });
    } else {
      emprunts.push({
        nomPret: str(r[0])!,
        societe,
        banque: str(r[2]) || "",
        comptaNo: null,
        montant: num(r[4]) || 0,
        taux: num(r[5]) || 0,
        dateDebut,
        echeanceAnnuelle2025: num(r[17]),
        capitalRestantDu2025: num(r[18]),
        echeanceAnnuelle2026: null,
        capitalRestantDu2026: null,
        dureeTotaleAns,
        dateFin,
      });
    }
  }
  return emprunts;
}

// ── Parse P&L sheets for charges (taxe foncière, etc.) ──────────────

interface PLCharges {
  sciName: string;
  taxeFonciere: number;
  taxeOrduresMenageres: number;
  assurance: number;
  chargesCopro: number;
  edf: number;
  eau: number;
  gaz: number;
  entretien: number;
  honorairesComptables: number;
  fraisBancaires: number;
  refacturations: number; // charges refacturées aux locataires (revenue offset)
  dotationAmortissement: number;
  interetsBancaires: number;
  depotGarantieLots: number; // DG logements + crèches
  // Per-lot 2026 rents from P&L locations section
  lotRents2026: { label: string; loyer: number }[];
}

function parsePLCharges(wb: XLSX.WorkBook): PLCharges[] {
  // Support both old "P&L xxx" and new "SCI xxx" sheet name formats
  const sciKeys = [
    { names: ["P&L 34 RUE HAUTE", "SCI 34 RUE HAUTE"], sci: "34 RUE HAUTE" },
    { names: ["P&L LEGRAND", "SCI LEGRAND"], sci: "LEGRAND" },
    { names: ["P&L ARMEE ORIENT", "SCI ARMEE ORIENT"], sci: "ARMEE ORIENT" },
    { names: ["P&L CHENNEVIERES", "SCI CHENNEVIERES"], sci: "CHENNEVIERES" },
    { names: ["P&L TAVERNY", "SCI TAVERNY"], sci: "TAVERNY" },
    { names: ["P&L GENERAL JULES BRIMON", "SCI GENERAL JULES BRIMONT"], sci: "GENERAL JULES BRIMONT" },
  ];

  const results: PLCharges[] = [];

  for (const { names, sci } of sciKeys) {
    const ws = names.map((n) => wb.Sheets[n]).find(Boolean);
    if (!ws) continue;

    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    const charges: PLCharges = {
      sciName: sci,
      taxeFonciere: 0,
      taxeOrduresMenageres: 0,
      assurance: 0,
      chargesCopro: 0,
      edf: 0,
      eau: 0,
      gaz: 0,
      entretien: 0,
      honorairesComptables: 0,
      fraisBancaires: 0,
      refacturations: 0,
      dotationAmortissement: 0,
      interetsBancaires: 0,
      depotGarantieLots: 0,
      lotRents2026: [],
    };

    // Row 3 has year headers: [null, null, "nb m²", "LOCATIONS", 2023, 2024, 2025, 2026]
    // Use 2026 BP data (column 7) as primary, fall back to 2025 (column 6) then 2024 (column 5)
    const yearCol = 7; // 2026

    // Pass 1: Extract per-lot rents from LOCATIONS section (rows 4-13)
    // and dépôts de garantie from DG rows
    let inLocationsSection = false;
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const label3 = String(row[3] ?? "").trim();

      // Detect LOCATIONS section start (row 3 has "LOCATIONS" header)
      if (label3 === "LOCATIONS") { inLocationsSection = true; continue; }
      // Detect CHARGES LOCATIVES section — end of locations
      if (label3 === "CHARGES LOCATIVES" || label3.includes("CHARGES LOCATIVES")) { inLocationsSection = false; }

      // Capture per-lot rents in LOCATIONS section
      if (inLocationsSection && label3 && !label3.startsWith("Location ")) {
        const rentVal = num(row[yearCol]) || num(row[yearCol - 1]) || 0;
        if (rentVal > 0) {
          charges.lotRents2026.push({ label: label3, loyer: rentVal });
        }
      }

      // Capture dépôts de garantie
      if (label3.startsWith("DG ")) {
        const dgVal = num(row[yearCol]) || num(row[yearCol - 1]) || num(row[yearCol - 2]) || 0;
        charges.depotGarantieLots += dgVal;
      }
    }

    // Pass 2: Extract P&L line items (charges, revenues, etc.)
    for (const row of raw) {
      if (!row || !row[3]) continue;
      const label = String(row[3]).trim();
      const val = num(row[yearCol]) || num(row[yearCol - 1]) || num(row[yearCol - 2]) || 0;

      // Refacturations de charges aux locataires (comptes 7088x)
      if (label.includes("70880") || label.includes("70881") || label.includes("REFACT")) {
        charges.refacturations += val;
      } else if (label.includes("63512") || label.includes("TAXE FONCIERES")) {
        charges.taxeFonciere = val;
      } else if (label.includes("63513") || label.includes("TAXE ORDURES")) {
        charges.taxeOrduresMenageres = val;
      } else if (label.includes("61600000") || label.includes("ASSURANCE LOYERS")) {
        charges.assurance += val;
      } else if (label.includes("61600300") || label.includes("ASSURANCE MULTIRISQUE")) {
        charges.assurance += val;
      } else if (label.includes("61420") || label.includes("CHARGES LOCATIVES")) {
        charges.chargesCopro = val;
      } else if (label.includes("60611") || label.includes("EDF")) {
        charges.edf = val;
      } else if (label.includes("60612") || label.includes("EAU")) {
        charges.eau = val;
      } else if (label.includes("60613") || label.includes("GAZ")) {
        charges.gaz = val;
      } else if (label.includes("61510") || label.includes("61520") || label.includes("ENTRETIEN")) {
        charges.entretien += val;
      } else if (label.includes("62260") || label.includes("HONORAIRES COMPTABLES")) {
        charges.honorairesComptables = val;
      } else if (label.includes("62780") || label.includes("FRAIS BANCAIRES")) {
        charges.fraisBancaires = val;
      } else if (label.includes("68112") || label.includes("DOTATION AMORT")) {
        charges.dotationAmortissement = val;
      } else if (label.includes("66112") || label.includes("INTERETS DES EMPRUNTS")) {
        charges.interetsBancaires += val;
      }
    }

    results.push(charges);
  }
  return results;
}

// ── Parse Feuil1 (Garanties bancaires par SCI) ─────────────────────

interface GarantieRow {
  sciName: string;
  banques: string;
  garantie: string;
}

function parseGaranties(wb: XLSX.WorkBook): GarantieRow[] {
  const sheet = wb.Sheets["Feuil1"];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: GarantieRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0] || r[0] === "SCI") continue;
    const sciName = str(r[0]);
    if (!sciName || SOLD_SCIS.has(sciName)) continue;

    rows.push({
      sciName,
      banques: str(r[1]) || "",
      garantie: str(r[2]) || "",
    });
  }
  return rows;
}

// ── Parse SYNTH (CA/RN prévisionnel par SCI) ────────────────────────

interface SynthRow {
  sciName: string;
  destination: string | null;
  fraisNotaire: number;
  loyerActuelHC: number;
  tauxRendement: number;
  valeurM2Acqui: number;
  valeurM2Actuelle: number;
}

interface SynthFinancials {
  sciName: string;
  ca2025: number;
  rn2025: number;
  ca2026: number;
  rn2026: number;
}

function parseSynthFinancials(wb: XLSX.WorkBook): { financials: SynthFinancials[]; rows: SynthRow[] } {
  const sheet = wb.Sheets["SYNTH"];
  if (!sheet) return { financials: [], rows: [] };
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const agg: Record<string, SynthFinancials> = {};
  const synthRows: SynthRow[] = [];

  // Headers row 1: col 4=frais notaire, col 9=loyer actuel HC, col 14=CA 2025,
  // col 15=RN 2025, col 16=CA 2026BP, col 17=RN 2026BP,
  // col 18=taux rendement, col 19=valeur m² acqui, col 20=valeur m² actuelle
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    const sciName = str(r[0])!;
    if (SOLD_SCIS.has(sciName)) continue;

    if (!agg[sciName]) {
      agg[sciName] = { sciName, ca2025: 0, rn2025: 0, ca2026: 0, rn2026: 0 };
    }
    agg[sciName].ca2025 += num(r[14]) || 0;
    agg[sciName].rn2025 += num(r[15]) || 0;
    agg[sciName].ca2026 += num(r[16]) || 0;
    agg[sciName].rn2026 += num(r[17]) || 0;

    // Capture per-row enrichment data (frais notaire, valorisation, etc.)
    synthRows.push({
      sciName,
      destination: str(r[2]),
      fraisNotaire: num(r[4]) || 0,
      loyerActuelHC: num(r[9]) || 0,
      tauxRendement: num(r[18]) || 0,
      valeurM2Acqui: num(r[19]) || 0,
      valeurM2Actuelle: num(r[20]) || 0,
    });
  }
  return { financials: Object.values(agg), rows: synthRows };
}

// ── Main import function ─────────────────────────────────────────────

export async function importExcelData(): Promise<{
  scis: number;
  actifs: number;
  lots: number;
  baux: number;
  emprunts: number;
  locataires: number;
  associes: number;
  participations: number;
}> {
  // Only the canonical Excel file should be used
  const fileNames = [
    "BDD SCI 07.04.26 - BDD - loyers actuels complétés.xlsx",
  ];
  const fs = await import("fs");
  let xlsxPath: string | undefined;

  // Search directories: __dirname, parent, cwd, and cwd parent
  const searchDirs = [
    __dirname,
    path.resolve(__dirname, ".."),
    process.cwd(),
    path.resolve(process.cwd(), ".."),
  ];
  logger.info("import: searching for Excel", { searchDirs, __dirname, cwd: process.cwd() });

  for (const dir of searchDirs) {
    if (xlsxPath) break;
    let dirFiles: string[];
    try { dirFiles = fs.readdirSync(dir); } catch { continue; }
    for (const fn of fileNames) {
      // NFD/NFC normalization: filesystem may store accented chars differently
      const match = dirFiles.find((f) => f.normalize("NFC") === fn.normalize("NFC"));
      if (match) {
        xlsxPath = path.resolve(dir, match);
        break;
      }
    }
  }
  if (!xlsxPath) {
    throw new Error(`Fichier Excel introuvable. Noms recherchés: ${fileNames.join(", ")}`);
  }
  logger.info("import: using Excel file", { path: xlsxPath });
  const wb = XLSX.readFile(xlsxPath);

  // Detect format: new combined "BDD" sheet vs old separate sheets
  const hasBDDSheet = !!wb.Sheets["BDD"];
  let patrimoineRows: PatrimoineRow[];
  let bauxRows: BailRow[];
  let financementRows: FinancementRow[];
  let detentionRows: DetentionRow[];

  if (hasBDDSheet) {
    logger.info("import: detected combined BDD sheet format");
    const bddResult = parseBDDSheet(wb);
    patrimoineRows = bddResult.patrimoine;
    bauxRows = bddResult.baux;
    financementRows = bddResult.financement;
    detentionRows = bddResult.detention;
  } else {
    logger.info("import: using separate sheets format (old)");
    patrimoineRows = parsePatrimoine(wb);
    bauxRows = parseBaux(wb);
    financementRows = parseFinancement(wb);
    detentionRows = parseDetention(wb);
  }

  // Emprunts: works for both old ("Emprunts Détaillés") and new ("Emprunts") sheets
  const empruntRows = parseEmpruntsDetailles(wb);
  // P&L charges: works for both "P&L xxx" and "SCI xxx" sheet names
  const plCharges = parsePLCharges(wb);
  // Garanties bancaires (Feuil1)
  const garantieRows = parseGaranties(wb);
  // CA/RN prévisionnel + enrichment (SYNTH)
  const { financials: synthFinancials, rows: synthRows } = parseSynthFinancials(wb);

  logger.info("import: parsed sheets", {
    format: hasBDDSheet ? "BDD combined" : "separate sheets",
    patrimoine: patrimoineRows.length,
    baux: bauxRows.length,
    financement: financementRows.length,
    detention: detentionRows.length,
    emprunts: empruntRows.length,
    plSheets: plCharges.length,
    garanties: garantieRows.length,
    synthFinancials: synthFinancials.length,
    synthRows: synthRows.length,
  });

  const client = await pool.connect();
  const counts = { scis: 0, actifs: 0, lots: 0, baux: 0, emprunts: 0, locataires: 0, associes: 0, participations: 0 };

  try {
    await client.query("BEGIN");

    // Clean existing AM data (in reverse FK order).
    // Post-unification: AM-scoped baux live in gl_baux with scope='am'.
    // Locataires are now shared with GL so we deliberately do NOT wipe them
    // here — re-imports may leave orphaned rows, but that's acceptable and
    // avoids nuking GL-side data. Fresh imports still allocate new UUIDs.
    await client.query(`DELETE FROM am_participations`);
    await client.query(`DELETE FROM gl_baux WHERE scope = 'am'`);
    await client.query(`DELETE FROM am_lots`);
    await client.query(`DELETE FROM am_emprunts`);
    await client.query(`DELETE FROM am_travaux`);
    await client.query(`DELETE FROM am_documents`);
    await client.query(`DELETE FROM am_actifs`);
    await client.query(`DELETE FROM am_associes`);
    await client.query(`DELETE FROM am_scis`);
    logger.info("import: cleaned existing AM data");

    // ─── 1. Create SCIs ──────────────────────────────────────────
    const sciIds: Record<string, string> = {};
    const uniqueScis = [...new Set(patrimoineRows.map((r) => r.sciName))];

    // Index SYNTH financials by SCI name
    const synthBySci: Record<string, SynthFinancials> = {};
    for (const s of synthFinancials) synthBySci[s.sciName] = s;

    for (const sciName of uniqueScis) {
      const sciId = id();
      sciIds[sciName] = sciId;

      const firstRow = patrimoineRows.find((r) => r.sciName === sciName)!;

      // Build notes: description + CA/RN prévisionnel
      const noteParts: string[] = [];
      if (firstRow.description) noteParts.push(firstRow.description);
      const synth = synthBySci[sciName];
      if (synth) {
        const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
        noteParts.push(`CA 2025: ${fmt(synth.ca2025)} € | RN 2025: ${fmt(synth.rn2025)} €`);
        noteParts.push(`CA 2026 (BP): ${fmt(synth.ca2026)} € | RN 2026 (BP): ${fmt(synth.rn2026)} €`);
      }

      await client.query(
        `INSERT INTO am_scis (id, nom, forme_juridique, adresse, ville, code_postal, date_creation, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [
          sciId,
          SCI_FULL_NAMES[sciName] || `SCI ${sciName}`,
          "SCI",
          firstRow.adresse,
          firstRow.ville,
          firstRow.codePostal,
          firstRow.dateAcquisition,
          noteParts.length > 0 ? noteParts.join("\n") : null,
        ]
      );
      counts.scis++;
    }
    logger.info(`import: created ${counts.scis} SCIs`);

    // ─── 2. Create Associés ──────────────────────────────────────
    const associeIds: Record<string, string> = {};
    const associeNames = [
      { key: "damien", nom: "Leroux", prenom: "Damien" },
      { key: "sebastien", nom: "Leroux", prenom: "Sébastien" },
      { key: "hio", nom: "HIO", prenom: null },
      { key: "axoriel", nom: "AXORIEL", prenom: null },
    ];

    for (const a of associeNames) {
      const aId = id();
      associeIds[a.key] = aId;
      await client.query(
        `INSERT INTO am_associes (id, nom, prenom, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`,
        [aId, a.nom, a.prenom]
      );
      counts.associes++;
    }
    logger.info(`import: created ${counts.associes} associés`);

    // ─── 3. Create Participations (from Détention Capital sheet) ──
    for (const d of detentionRows) {
      const sciId = sciIds[d.sciName];
      if (!sciId) continue;

      const parts = [
        { key: "damien", pct: d.damien },
        { key: "sebastien", pct: d.sebastien },
        { key: "hio", pct: d.hio },
        { key: "axoriel", pct: d.axoriel },
      ];

      for (const p of parts) {
        if (p.pct > 0) {
          await client.query(
            `INSERT INTO am_participations (id, associe_id, sci_id, pourcentage, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, now())`,
            [
              id(),
              associeIds[p.key],
              sciId,
              (p.pct * 100).toFixed(2),
              d.demembrement || null,
            ]
          );
          counts.participations++;
        }
      }
    }
    logger.info(`import: created ${counts.participations} participations`);

    // ─── 4. Create Actifs (grouped by SCI + adresse) ─────────────
    const actifIds: Record<string, string> = {}; // key = "sciName|adresse"
    const actifGroups: Record<string, PatrimoineRow[]> = {};

    for (const r of patrimoineRows) {
      const key = `${r.sciName}|${r.adresse}`;
      if (!actifGroups[key]) actifGroups[key] = [];
      actifGroups[key].push(r);
    }

    // Get P&L charges indexed by SCI name
    const chargesBySci: Record<string, PLCharges> = {};
    for (const c of plCharges) chargesBySci[c.sciName] = c;

    // Get financement data indexed by "sciName|adresse"
    const financementBySciAddr: Record<string, FinancementRow[]> = {};
    for (const f of financementRows) {
      const key = `${f.sciName}|${f.adresse}`;
      if (!financementBySciAddr[key]) financementBySciAddr[key] = [];
      financementBySciAddr[key].push(f);
    }

    // Count actifs per SCI for distributing charges
    const actifCountBySci: Record<string, number> = {};
    for (const key of Object.keys(actifGroups)) {
      const sciName = key.split("|")[0];
      actifCountBySci[sciName] = (actifCountBySci[sciName] || 0) + 1;
    }

    for (const [key, rows] of Object.entries(actifGroups)) {
      const first = rows[0];
      const sciName = first.sciName;
      const actifId = id();
      actifIds[key] = actifId;

      // Get acquisition price: from Patrimoine or from Financement quote-parts sum
      let prixAcquisition = rows.reduce((s, r) => s + (r.prixAcquisition || 0), 0);
      if (prixAcquisition <= 0) {
        const finRows = financementBySciAddr[key] || [];
        prixAcquisition = finRows.reduce((s, f) => s + (f.quotePartPrixAchat || 0), 0);
      }

      // Get baux for this address for total surface
      const adresseBaux = bauxRows.filter((b) => b.sciName === sciName && b.adresse === first.adresse);
      const totalSurfaceLouee = adresseBaux.reduce((s, b) => s + (b.surfaceLouee || 0), 0);

      // Financement data for this actif
      const finRows = financementBySciAddr[key] || [];
      const firstFin = finRows[0];
      const vo = firstFin?.vo;
      const vnc = firstFin?.vnc;

      // Charges from P&L, distributed evenly across actifs of same SCI
      // NET of refacturations — charges récupérables are billed back to tenants,
      // so the net cash impact is (charges brutes - refacturations).
      // We distribute the refacturation proportionally across charge categories.
      const sciCharges = chargesBySci[sciName];
      const actifCount = actifCountBySci[sciName] || 1;
      let taxeFonciere = 0, assurance = 0, chargesCopro = 0;
      if (sciCharges) {
        const totalBrut = sciCharges.taxeFonciere + sciCharges.assurance + sciCharges.chargesCopro;
        const refactRatio = totalBrut > 0 ? Math.min(sciCharges.refacturations / totalBrut, 1) : 0;
        // Net charges = brut × (1 - ratio de refacturation)
        const netFactor = (1 - refactRatio) / actifCount;
        taxeFonciere = sciCharges.taxeFonciere * netFactor;
        assurance = sciCharges.assurance * netFactor;
        chargesCopro = sciCharges.chargesCopro * netFactor;
      }

      const isCopro = first.copro === "oui";
      const surface = first.surfacesPrivatives || first.surfaceTerrain || totalSurfaceLouee;

      // Determine type from destinations
      const destinations = rows.map((r) => r.destination?.toLowerCase() || "");
      const hasCreche = destinations.some((d) => d.includes("crèche") || d.includes("creche"));
      const hasBureau = destinations.some((d) => d.includes("bureau"));
      const hasLogement = destinations.some((d) => d.includes("logement"));
      let type = "mixte";
      if (hasCreche && !hasLogement && !hasBureau) type = "creche";
      else if (hasLogement && !hasCreche && !hasBureau) type = "habitation";
      else if (hasBureau && !hasCreche && !hasLogement) type = "bureau";

      // Name: use destination if single-lot, otherwise address + ville
      const nom = rows.length === 1 && first.destination
        ? first.destination
        : `${first.adresse}, ${first.ville}`;

      // SYNTH enrichment: frais notaire, taux rendement, prix m²
      // Match SYNTH rows by SCI + destination substring
      const matchingSynthRows = synthRows.filter((sr) => sr.sciName === sciName);
      let fraisNotaire = 0;
      let tauxRendement = 0;
      let prixM2Actuelle = 0;
      for (const sr of matchingSynthRows) {
        if (sr.fraisNotaire > 0) fraisNotaire += sr.fraisNotaire;
        if (sr.tauxRendement > 0 && tauxRendement === 0) tauxRendement = sr.tauxRendement;
        if (sr.valeurM2Actuelle > 0 && prixM2Actuelle === 0) prixM2Actuelle = sr.valeurM2Actuelle;
      }

      await client.query(
        `INSERT INTO am_actifs (id, sci_id, nom, adresse, ville, code_postal, type, surface, surface_carrez,
         reference_cadastrale, prix_acquisition, frais_notaire, date_acquisition, regime_juridique,
         taxe_fonciere, assurance_pno, charges_copropriete, prix_m2_marche,
         notes, erp, pmi, taux_capitalisation, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, now(), now())`,
        [
          actifId,
          sciIds[sciName],
          nom,
          first.adresse,
          first.ville,
          first.codePostal,
          type,
          surface,
          first.surfacesPrivatives || totalSurfaceLouee,
          first.cadastre,
          prixAcquisition > 0 ? prixAcquisition : null,
          fraisNotaire > 0 ? fraisNotaire : null,
          first.dateAcquisition,
          isCopro ? "copropriété" : "pleine propriété",
          taxeFonciere > 0 ? taxeFonciere : null,
          assurance > 0 ? assurance : null,
          chargesCopro > 0 ? chargesCopro : null,
          prixM2Actuelle > 0 ? prixM2Actuelle : null,
          [first.description, vo ? `VO: ${vo}€` : null, vnc ? `VNC: ${vnc}€` : null]
            .filter(Boolean).join("\n") || null,
          false,
          false,
          tauxRendement > 0 ? tauxRendement * 100 : 7, // SYNTH taux rendement, default 7%
        ]
      );
      counts.actifs++;
    }
    logger.info(`import: created ${counts.actifs} actifs`);

    // ─── 5. Create Locataires (from Baux sheet) ──────────────────
    const locataireIds: Record<string, string> = {};

    for (const b of bauxRows) {
      if (!b.locataire || locataireIds[b.locataire]) continue;
      const locId = id();
      locataireIds[b.locataire] = locId;

      await client.query(
        `INSERT INTO gl_locataires (id, nom, notes, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`,
        [locId, b.locataire, b.typeBail ? `Type: ${b.typeBail}` : null]
      );
      counts.locataires++;
    }
    logger.info(`import: created ${counts.locataires} locataires`);

    // ─── 6. Create Lots + Baux (from Baux sheet) ─────────────────
    // Index P&L per-lot rents by SCI for fallback when BDD loyerActuelHC is missing
    const lotRentsBySci: Record<string, { label: string; loyer: number }[]> = {};
    for (const c of plCharges) {
      if (c.lotRents2026.length > 0) lotRentsBySci[c.sciName] = c.lotRents2026;
    }

    // Index DG totals per SCI, distributed per lot count
    const dgBySci: Record<string, number> = {};
    for (const c of plCharges) {
      if (c.depotGarantieLots > 0) dgBySci[c.sciName] = c.depotGarantieLots;
    }

    for (const b of bauxRows) {
      const actifKey = `${b.sciName}|${b.adresse}`;
      const actifId = actifIds[actifKey];
      const sciId = sciIds[b.sciName];

      if (!actifId) {
        logger.warn(`import: no actif found for bail ${actifKey} (${b.destination})`);
        continue;
      }

      // Priority: BDD loyerActuelHC (col 21) → P&L 2026 rent by matching lot label → BDD loyerDepart
      let loyerAnnuel = b.loyerActuelHC;
      if (!loyerAnnuel && b.destination) {
        const sciRents = lotRentsBySci[b.sciName] || [];
        const match = sciRents.find((lr) =>
          lr.label.includes(b.destination!.substring(0, 15)) ||
          b.destination!.includes(lr.label.substring(0, 15))
        );
        if (match) {
          loyerAnnuel = match.loyer;
          logger.info(`import: P&L 2026 rent fallback for ${b.destination}: ${loyerAnnuel}`);
        }
      }
      if (!loyerAnnuel) loyerAnnuel = b.loyerAnnuelDepart;

      // Create Lot
      const lotId = id();
      await client.query(
        `INSERT INTO am_lots (id, actif_id, sci_id, designation, type, surface, surface_carrez,
         loyer_mensuel, loyer_annuel, statut, locataire_id, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
        [
          lotId,
          actifId,
          sciId,
          b.destination || "Lot principal",
          b.typeBail === "logement" ? "habitation" :
            b.typeBail === "commercial" ? "commercial" :
            b.typeBail === "professionnel" ? "professionnel" :
            b.typeBail?.includes("dérogatoire") ? "commercial" : "autre",
          b.surfaceLouee,
          b.surfaceLouee,
          loyerAnnuel ? (loyerAnnuel / 12).toFixed(2) : null,
          loyerAnnuel,
          b.locataire ? "loué" : "vacant",
          b.locataire ? locataireIds[b.locataire] : null,
          null,
        ]
      );
      counts.lots++;

      // Create Bail
      if (b.locataire) {
        let indiceRef: string | null = null;
        let valeurIndice: number | null = null;
        if (b.indiceRevalorisation) {
          if (b.indiceRevalorisation.includes("ILC")) indiceRef = "ILC";
          else if (b.indiceRevalorisation.includes("IRL")) indiceRef = "IRL";
          else if (b.indiceRevalorisation.includes("ICC")) indiceRef = "ICC";
          else if (b.indiceRevalorisation.includes("ILAT")) indiceRef = "ILAT";

          const valMatch = b.indiceRevalorisation.match(/=\s*([\d.,]+)/);
          if (valMatch) valeurIndice = num(valMatch[1]);
        }

        let trimestreRef: string | null = null;
        if (b.indiceRevalorisation) {
          const trimMatch = b.indiceRevalorisation.match(/(\d)T(\d{4})/);
          if (trimMatch) trimestreRef = `T${trimMatch[1]} ${trimMatch[2]}`;
        }

        // Distribute P&L dépôt de garantie across lots of this SCI
        const sciDgTotal = dgBySci[b.sciName] || 0;
        const sciBauxCount = bauxRows.filter((x) => x.sciName === b.sciName && x.locataire).length || 1;
        const depotGarantie = sciDgTotal > 0 ? Math.round(sciDgTotal / sciBauxCount) : null;

        // Insert into unified gl_baux with scope='am'. Mirror loyer_annuel
        // into loyer_base_ht / loyer_ht_actu so indexation auto has a rent to
        // work from, and use a derived fallback name.
        const bailNom = `${b.destination || "Bail"} — ${b.locataire}`;
        await client.query(
          `INSERT INTO gl_baux (
             id, scope, nom,
             lot_id, actif_id, sci_id, locataire_id, type_bail,
             date_debut, date_fin,
             loyer_mensuel, loyer_annuel, loyer_base_ht, loyer_ht_actu,
             depot_garantie, indice_reference, trimestre_ref, valeur_indice_base,
             statut, loyer_theorique, notes, created_at, updated_at
           )
           VALUES (
             $1, 'am', $2,
             $3, $4, $5, $6, $7,
             $8::timestamp, $9::timestamp,
             $10, $11, $11, $11,
             $12, $13, $14, $15,
             $16, $17, $18, now(), now()
           )`,
          [
            id(),
            bailNom,
            lotId,
            actifId,
            sciId,
            locataireIds[b.locataire],
            b.typeBail,
            b.dateDebut,
            b.dateFin,
            loyerAnnuel ? (loyerAnnuel / 12).toFixed(2) : null,
            loyerAnnuel,
            depotGarantie,
            indiceRef,
            trimestreRef,
            valeurIndice,
            "actif",
            b.loyerAnnuelDepart,
            [
              b.soumisTVA === "oui" ? "Soumis à TVA" : null,
            ].filter(Boolean).join("\n") || null,
          ]
        );
        counts.baux++;
      }
    }
    logger.info(`import: created ${counts.lots} lots, ${counts.baux} baux`);

    // ─── 7. Create Emprunts (from Emprunts Détaillés + Financement) ─
    // Index garanties by "sciName|banque" for lookup
    const garantieBySciBank: Record<string, string> = {};
    for (const g of garantieRows) {
      // "SG et CE" → split and index each bank separately
      const banks = g.banques.split(/\s+et\s+|\s*,\s*/);
      for (const b of banks) {
        garantieBySciBank[`${g.sciName}|${b.trim()}`] = g.garantie;
      }
    }

    for (const e of empruntRows) {
      // Determine SCI from société code
      let sciName = SOCIETE_TO_SCI[e.societe];

      // AXORIEL/HIO holding level emprunts - skip for now
      if (!sciName) {
        if (e.societe === "AXORIEL" || e.societe === "HIO") {
          logger.info(`import: skipping holding emprunt ${e.nomPret} (${e.societe})`);
          continue;
        }
        logger.info(`import: skipping emprunt ${e.nomPret} (unknown société ${e.societe})`);
        continue;
      }

      const sciId = sciIds[sciName];
      if (!sciId) {
        logger.info(`import: skipping emprunt ${e.nomPret} (SCI ${sciName} not found)`);
        continue;
      }

      // Find matching financement row for duration, date fin, taux assurance, IRA
      const sciFinRows = financementRows.filter((f) => f.sciName === sciName);
      let dureeAns: number | null = null;
      let dateFin: string | null = null;
      let tauxAssurance: number | null = null;
      let iraStr: string | null = null;

      for (const f of sciFinRows) {
        if (f.banques?.includes(e.banque)) {
          if (f.duree) {
            // Parse "15 CE et 7 SG" — find the duration segment matching this bank
            const dureeStr = String(f.duree);
            const bankDureeMatch = dureeStr.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${e.banque}`, "i"));
            if (bankDureeMatch) {
              dureeAns = Math.round(parseFloat(bankDureeMatch[1]));
            } else {
              // Fallback: first number (e.g. "15" or "20")
              const dMatch = dureeStr.match(/(\d+(?:\.\d+)?)/);
              if (dMatch) dureeAns = Math.round(parseFloat(dMatch[1]));
            }
          }
          if (f.dateFinEmprunt) dateFin = f.dateFinEmprunt;
          if (f.tauxAssurance) {
            const aVal = num(f.tauxAssurance);
            if (aVal != null) tauxAssurance = aVal < 1 ? aVal * 100 : aVal;
          }
          iraStr = f.tauxIRA;
          break;
        }
      }

      // Best source: duration derived from Emprunts amortization schedule
      if (!dureeAns && e.dureeTotaleAns) {
        dureeAns = e.dureeTotaleAns;
      }

      // Use date_fin from Emprunts schedule if not found in financement
      if (!dateFin && e.dateFin) {
        dateFin = e.dateFin;
      }

      // Fallback: calculate durée from dateDebut + dateFin
      if (!dureeAns && e.dateDebut && dateFin) {
        const start = new Date(e.dateDebut);
        const end = new Date(dateFin);
        const diffYears = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (diffYears > 0) dureeAns = Math.round(diffYears);
      }

      if (!dureeAns) dureeAns = 15; // Last resort default

      // IRA amount
      let iraAmount: number | null = null;
      if (iraStr) {
        const iraNum = num(iraStr);
        if (iraNum != null && iraNum < 1) {
          iraAmount = iraNum * e.montant; // It's a percentage in decimal
        }
      }

      // Look up garantie from Feuil1
      const garantieKey = `${sciName}|${e.banque}`;
      const garantieText = garantieBySciBank[garantieKey] || null;

      // Use 2026 annual payment if available (more representative full-year),
      // otherwise fall back to 2025
      const echeanceAnnuelle = e.echeanceAnnuelle2026 && e.echeanceAnnuelle2026 > 0
        ? e.echeanceAnnuelle2026 : e.echeanceAnnuelle2025;
      const mensualiteReelle = echeanceAnnuelle ? (echeanceAnnuelle / 12) : null;

      // Capital restant dû: use end-2025 (= start 2026) as the reference snapshot
      const capitalRestant = e.capitalRestantDu2025;

      // Back-derive implied assurance rate from gap between actuarial formula and real payment
      // Excel échéances = capital + intérêts + assurance emprunteur
      // impliedAssurance% = (échéance_Excel - formule_actuarielle) / montant × 100
      let reconNote = "";
      if (!tauxAssurance && echeanceAnnuelle && e.montant > 0 && e.taux > 0 && dureeAns > 0) {
        const rm = e.taux / 12; // taux is already decimal from Excel
        const n = dureeAns * 12;
        const factor = Math.pow(1 + rm, n);
        const annuiteActuarielle = e.montant * (rm * factor) / (factor - 1) * 12;
        const gap = echeanceAnnuelle - annuiteActuarielle;
        const impliedRate = (gap / e.montant) * 100; // as percentage
        // Only use if plausible (0% to 2% — typical assurance rates)
        if (impliedRate > 0.01 && impliedRate < 2) {
          tauxAssurance = Math.round(impliedRate * 1000) / 1000; // round to 3 decimals
          reconNote = `[auto] Taux assurance dérivé: ${tauxAssurance}%`;
          logger.info(`import: derived assurance rate ${tauxAssurance}% for ${e.nomPret} (${e.banque})`);
        } else if (impliedRate <= 0) {
          reconNote = `[recon] Écart négatif (${impliedRate.toFixed(2)}%): probable année partielle ou différé`;
          logger.info(`import: negative gap for ${e.nomPret} (${e.banque}): implied ${impliedRate.toFixed(2)}% — partial year?`);
        } else {
          const crd = capitalRestant || 0;
          const crdRatio = e.montant > 0 ? (crd / e.montant) * 100 : 0;
          reconNote = `[recon] Écart élevé (${impliedRate.toFixed(2)}%): CRD=${crdRatio.toFixed(0)}% du montant — prêt en fin de vie?`;
          logger.info(`import: high gap for ${e.nomPret} (${e.banque}): implied ${impliedRate.toFixed(2)}%, CRD ratio ${crdRatio.toFixed(0)}%`);
        }
      }

      // Build notes with all available metadata
      const noteParts = [`Prêt: ${e.nomPret}`];
      if (e.comptaNo && e.comptaNo !== "0") noteParts.push(`Cpte: ${e.comptaNo}`);
      if (reconNote) noteParts.push(reconNote);

      await client.query(
        `INSERT INTO am_emprunts (id, sci_id, banque, montant_emprunte, capital_restant_du,
         taux_annuel, duree_ans, date_debut, date_fin, type_amortissement,
         mensualite, taux_assurance, ira, type_garantie, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now())`,
        [
          id(),
          sciId,
          e.banque,
          e.montant,
          capitalRestant,
          e.taux * 100, // Convert from decimal to percentage
          dureeAns,
          e.dateDebut,
          dateFin,
          "constant",
          mensualiteReelle,
          tauxAssurance,
          iraAmount,
          garantieText,
          noteParts.join(" | "),
        ]
      );
      counts.emprunts++;
    }
    logger.info(`import: created ${counts.emprunts} emprunts`);

    await client.query("COMMIT");
    logger.info("import: transaction committed successfully", counts);

    // Géocoder automatiquement les actifs importés (en arrière-plan, sans bloquer)
    geocodeImportedActifs().catch((err) =>
      logger.warn("import: geocoding failed (non-blocking)", { error: err.message })
    );

    return counts;
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("import: ROLLBACK", { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Géocode tous les actifs sans coordonnées GPS après un import Excel.
 * Exécuté en arrière-plan pour ne pas bloquer la réponse de l'import.
 */
async function geocodeImportedActifs() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, nom, adresse, ville, code_postal FROM am_actifs
       WHERE deleted_at IS NULL AND (lat IS NULL OR lng IS NULL)
       AND (adresse IS NOT NULL OR ville IS NOT NULL)`
    );

    let geocoded = 0;
    for (const row of rows) {
      const geo = await geocodeAddress(row.adresse, row.code_postal, row.ville);
      if (geo) {
        await client.query(
          `UPDATE am_actifs SET lat = $1, lng = $2, updated_at = now() WHERE id = $3`,
          [geo.lat, geo.lng, row.id]
        );
        geocoded++;
        logger.info("import geocode", { nom: row.nom, lat: geo.lat, lng: geo.lng });
      }
      // Pause 200ms entre chaque requête
      await new Promise((r) => setTimeout(r, 200));
    }

    logger.info(`import: geocoded ${geocoded}/${rows.length} actifs`);
  } finally {
    client.release();
  }
}
