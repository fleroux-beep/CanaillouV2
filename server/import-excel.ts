/**
 * Import script: reads the restructured Excel BDD file and inserts data into PostgreSQL.
 * Called via POST /api/admin/import-excel (requires admin auth).
 *
 * Source file: BDD_SCI_restructuree.xlsx
 * Sheets used: Patrimoine, Baux, Financement, Détention Capital, Emprunts Détaillés, P&L *
 *
 * Tables populated: am_scis, am_actifs, am_lots, am_baux, am_emprunts,
 *                   am_locataires, am_associes, am_participations
 */
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { pool } from "./db";
import { logger } from "./lib/logger";

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

// ── Parse Patrimoine sheet ──────────────────────────────────────────

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

function parsePatrimoine(wb: XLSX.WorkBook): PatrimoineRow[] {
  const sheet = wb.Sheets["Patrimoine"];
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

// ── Parse Baux sheet ────────────────────────────────────────────────

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

function parseBaux(wb: XLSX.WorkBook): BailRow[] {
  const sheet = wb.Sheets["Baux"];
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

// ── Parse Financement sheet ─────────────────────────────────────────

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

function parseFinancement(wb: XLSX.WorkBook): FinancementRow[] {
  const sheet = wb.Sheets["Financement"];
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

// ── Parse Détention Capital sheet ───────────────────────────────────

interface DetentionRow {
  sciName: string;
  damien: number;
  sebastien: number;
  hio: number;
  axoriel: number;
  demembrement: string | null;
}

function parseDetention(wb: XLSX.WorkBook): DetentionRow[] {
  const sheet = wb.Sheets["Détention Capital"];
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

// ── Parse Emprunts Détaillés sheet ──────────────────────────────────

interface EmpruntDetailRow {
  nomPret: string;
  societe: string;
  banque: string;
  montant: number;
  taux: number;
  dateDebut: string | null;
  capitalRestantDu2025: number | null;
  echeanceAnnuelle2025: number | null;
}

function parseEmpruntsDetailles(wb: XLSX.WorkBook): EmpruntDetailRow[] {
  const sheet = wb.Sheets["Emprunts Détaillés"];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const emprunts: EmpruntDetailRow[] = [];

  // Row 0 = headers, Row 1 = sub-headers, data from row 2
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0] || String(r[0]) === "TOTAL") continue;

    const societe = str(r[1]) || "";
    // Skip sold SCIs
    if (societe.includes("HOCHE") || societe.includes("MADELI") || societe.includes("ARAGO")) continue;

    emprunts.push({
      nomPret: str(r[0])!,
      societe,
      banque: str(r[2]) || "",
      montant: num(r[4]) || 0,
      taux: num(r[5]) || 0,
      dateDebut: excelDateToISO(r[6]),
      // Columns: 7=2020 ech, 8=2020 solde, 9=2021 ech, 10=2021 solde, ..., 17=2025 ech, 18=2025 solde
      echeanceAnnuelle2025: num(r[17]),
      capitalRestantDu2025: num(r[18]),
    });
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
}

function parsePLCharges(wb: XLSX.WorkBook): PLCharges[] {
  const plSheets = [
    { sheet: "P&L 34 RUE HAUTE", sci: "34 RUE HAUTE" },
    { sheet: "P&L LEGRAND", sci: "LEGRAND" },
    { sheet: "P&L ARMEE ORIENT", sci: "ARMEE ORIENT" },
    { sheet: "P&L CHENNEVIERES", sci: "CHENNEVIERES" },
    { sheet: "P&L TAVERNY", sci: "TAVERNY" },
    { sheet: "P&L GENERAL JULES BRIMON", sci: "GENERAL JULES BRIMONT" },
  ];

  const results: PLCharges[] = [];

  for (const { sheet: sheetName, sci } of plSheets) {
    const ws = wb.Sheets[sheetName];
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
    };

    // Find the most recent year column (typically column index 7 = 2026, or 6 = 2025)
    // Row 3 has year headers: [null, null, "nb m²", "LOCATIONS", 2023, 2024, 2025, 2026]
    // Use 2025 data (column 6) as most reliable, or 2024 (column 5) as fallback
    const yearCol = 6; // 2025

    for (const row of raw) {
      if (!row || !row[3]) continue;
      const label = String(row[3]).trim();
      const val = num(row[yearCol]) || num(row[yearCol - 1]) || 0;

      if (label.includes("63512") || label.includes("TAXE FONCIERES")) {
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
      }
    }

    results.push(charges);
  }
  return results;
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
  const fileName = "BDD_SCI_restructuree.xlsx";
  const candidatePaths = [
    path.resolve(__dirname, fileName),
    path.resolve(__dirname, "..", fileName),
  ];
  const fs = await import("fs");
  const xlsxPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!xlsxPath) {
    throw new Error(`Fichier Excel introuvable. Chemins vérifiés: ${candidatePaths.join(", ")}`);
  }
  const wb = XLSX.readFile(xlsxPath);

  // Parse all sheets
  const patrimoineRows = parsePatrimoine(wb);
  const bauxRows = parseBaux(wb);
  const financementRows = parseFinancement(wb);
  const detentionRows = parseDetention(wb);
  const empruntRows = parseEmpruntsDetailles(wb);
  const plCharges = parsePLCharges(wb);

  logger.info("import: parsed sheets", {
    patrimoine: patrimoineRows.length,
    baux: bauxRows.length,
    financement: financementRows.length,
    detention: detentionRows.length,
    emprunts: empruntRows.length,
    plSheets: plCharges.length,
  });

  const client = await pool.connect();
  const counts = { scis: 0, actifs: 0, lots: 0, baux: 0, emprunts: 0, locataires: 0, associes: 0, participations: 0 };

  try {
    await client.query("BEGIN");

    // Clean existing AM data (in reverse FK order)
    await client.query(`DELETE FROM am_participations`);
    await client.query(`DELETE FROM am_baux`);
    await client.query(`DELETE FROM am_lots`);
    await client.query(`DELETE FROM am_emprunts`);
    await client.query(`DELETE FROM am_travaux`);
    await client.query(`DELETE FROM am_documents`);
    await client.query(`DELETE FROM am_actifs`);
    await client.query(`DELETE FROM am_locataires`);
    await client.query(`DELETE FROM am_associes`);
    await client.query(`DELETE FROM am_scis`);
    logger.info("import: cleaned existing AM data");

    // ─── 1. Create SCIs ──────────────────────────────────────────
    const sciIds: Record<string, string> = {};
    const uniqueScis = [...new Set(patrimoineRows.map((r) => r.sciName))];

    for (const sciName of uniqueScis) {
      const sciId = id();
      sciIds[sciName] = sciId;

      const firstRow = patrimoineRows.find((r) => r.sciName === sciName)!;

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
          firstRow.description,
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
      const sciCharges = chargesBySci[sciName];
      const actifCount = actifCountBySci[sciName] || 1;
      const taxeFonciere = sciCharges ? sciCharges.taxeFonciere / actifCount : 0;
      const assurance = sciCharges ? sciCharges.assurance / actifCount : 0;
      const chargesCopro = sciCharges ? sciCharges.chargesCopro / actifCount : 0;

      const isCopro = first.copro === "oui";
      const surface = first.surfacesPrivatives || first.surfaceTerrain || totalSurfaceLouee;

      // Determine type from destinations
      const destinations = rows.map((r) => r.destination?.toLowerCase() || "");
      const hasCreche = destinations.some((d) => d.includes("crèche") || d.includes("creche"));
      const hasBureau = destinations.some((d) => d.includes("bureau"));
      const hasLogement = destinations.some((d) => d.includes("logement"));
      let type = "mixte";
      if (hasCreche && !hasLogement && !hasBureau) type = "commerce";
      else if (hasLogement && !hasCreche && !hasBureau) type = "habitation";
      else if (hasBureau && !hasCreche && !hasLogement) type = "bureau";

      // Name: use destination if single-lot, otherwise address + ville
      const nom = rows.length === 1 && first.destination
        ? first.destination
        : `${first.adresse}, ${first.ville}`;

      await client.query(
        `INSERT INTO am_actifs (id, sci_id, nom, adresse, ville, code_postal, type, surface, surface_carrez,
         reference_cadastrale, prix_acquisition, date_acquisition, regime_juridique,
         taxe_fonciere, assurance_pno, charges_copropriete,
         notes, erp, pmi, taux_capitalisation, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), now())`,
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
          first.dateAcquisition,
          isCopro ? "copropriété" : "pleine propriété",
          taxeFonciere > 0 ? taxeFonciere : null,
          assurance > 0 ? assurance : null,
          chargesCopro > 0 ? chargesCopro : null,
          [first.description, vo ? `VO: ${vo}€` : null, vnc ? `VNC: ${vnc}€` : null]
            .filter(Boolean).join("\n") || null,
          false,
          false,
          7, // Taux de capitalisation par défaut : 7% (from Valorisation sheet)
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
        `INSERT INTO am_locataires (id, nom, notes, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`,
        [locId, b.locataire, b.typeBail ? `Type: ${b.typeBail}` : null]
      );
      counts.locataires++;
    }
    logger.info(`import: created ${counts.locataires} locataires`);

    // ─── 6. Create Lots + Baux (from Baux sheet) ─────────────────
    for (const b of bauxRows) {
      const actifKey = `${b.sciName}|${b.adresse}`;
      const actifId = actifIds[actifKey];
      const sciId = sciIds[b.sciName];

      if (!actifId) {
        logger.warn(`import: no actif found for bail ${actifKey} (${b.destination})`);
        continue;
      }

      const loyerAnnuel = b.loyerActuelHC || b.loyerAnnuelDepart;

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

        await client.query(
          `INSERT INTO am_baux (id, lot_id, actif_id, sci_id, locataire_id, type_bail,
           date_debut, date_fin, loyer_mensuel, loyer_annuel, indice_reference,
           trimestre_ref, valeur_indice_base, statut, loyer_theorique, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now())`,
          [
            id(),
            lotId,
            actifId,
            sciId,
            locataireIds[b.locataire],
            b.typeBail,
            b.dateDebut,
            b.dateFin,
            loyerAnnuel ? (loyerAnnuel / 12).toFixed(2) : null,
            loyerAnnuel,
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
            // Parse "15 CE et 7 SG" or "15" or "15.5" or "20"
            const dMatch = f.duree.match(/(\d+(?:\.\d+)?)/);
            if (dMatch) dureeAns = Math.round(parseFloat(dMatch[1]));
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

      // Fallback: calculate durée from dateDebut + dateFin
      if (!dureeAns && e.dateDebut && dateFin) {
        const start = new Date(e.dateDebut);
        const end = new Date(dateFin);
        const diffYears = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (diffYears > 0) dureeAns = Math.round(diffYears);
      }

      if (!dureeAns) dureeAns = 15; // Default for most of these loans

      // IRA amount
      let iraAmount: number | null = null;
      if (iraStr) {
        const iraNum = num(iraStr);
        if (iraNum != null && iraNum < 1) {
          iraAmount = iraNum * e.montant; // It's a percentage in decimal
        }
      }

      await client.query(
        `INSERT INTO am_emprunts (id, sci_id, banque, montant_emprunte, capital_restant_du,
         taux_annuel, duree_ans, date_debut, date_fin, type_amortissement,
         taux_assurance, ira, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())`,
        [
          id(),
          sciId,
          e.banque,
          e.montant,
          e.capitalRestantDu2025,
          e.taux * 100, // Convert from decimal to percentage
          dureeAns,
          e.dateDebut,
          dateFin,
          "constant",
          tauxAssurance,
          iraAmount,
          `Prêt: ${e.nomPret}`,
        ]
      );
      counts.emprunts++;
    }
    logger.info(`import: created ${counts.emprunts} emprunts`);

    await client.query("COMMIT");
    logger.info("import: transaction committed successfully", counts);
    return counts;
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("import: ROLLBACK", { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
}
