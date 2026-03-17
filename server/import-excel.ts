/**
 * Import script: reads the Excel BDD file and inserts data into PostgreSQL.
 * Called via POST /api/admin/import-excel (requires admin auth).
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
  const n = Number(serial);
  if (isNaN(n) || n < 1000) return typeof serial === "string" ? serial : null;
  // Excel serial date → JS date
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + n * 86400000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

// ── Parse the BDD sheet ──────────────────────────────────────────────

interface RawRow {
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
  typeBail: string | null;
  locataire: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  loyerAnnuelDepart: number | null;
  soumisTVA: string | null;
  indiceRevalorisation: string | null;
  loyerAnnuelActuel: number | null;
  surfaceLouee: number | null;
  quotePartPrixAchat: number | null;
  apport: number | null;
  totalEmprunts: number | null;
  vo: number | null;
  vnc: number | null;
  quotePartEmprunt: number | null;
  quotePartEmpruntRestant: number | null;
  banques: string | null;
  garantie: string | null;
  duree: string | null;
  dateFinEmprunt: string | null;
  tauxInteret: string | null;
  tauxAssurance: string | null;
  tauxIRA: string | null;
  compteCourant: number | null;
  damien: number | null;
  sebastien: number | null;
  hio: number | null;
  axoriel: number | null;
}

function parseBDD(wb: XLSX.WorkBook): RawRow[] {
  const sheet = wb.Sheets["BDD"];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const rows: RawRow[] = [];

  // Data starts at row 2 (0-indexed), headers at row 1
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0] || r[1] === "VENDU") continue; // skip empty / sold

    rows.push({
      sciName: str(r[0])!,
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
      typeBail: str(r[14]),
      locataire: str(r[15]),
      dateDebut: excelDateToISO(r[16]),
      dateFin: excelDateToISO(r[17]),
      loyerAnnuelDepart: num(r[18]),
      soumisTVA: str(r[19]),
      indiceRevalorisation: str(r[20]),
      loyerAnnuelActuel: num(r[21]),
      surfaceLouee: num(r[22]),
      quotePartPrixAchat: num(r[23]),
      apport: num(r[24]),
      totalEmprunts: num(r[25]),
      vo: num(r[26]),
      vnc: num(r[27]),
      quotePartEmprunt: num(r[28]),
      quotePartEmpruntRestant: num(r[29]),
      banques: str(r[30]),
      garantie: str(r[31]),
      duree: str(r[32]),
      dateFinEmprunt: excelDateToISO(r[33]),
      tauxInteret: str(r[34]),
      tauxAssurance: str(r[35]),
      tauxIRA: str(r[36]),
      compteCourant: num(r[37]),
      damien: num(r[38]),
      sebastien: num(r[39]),
      hio: num(r[40]),
      axoriel: num(r[41]),
    });
  }
  return rows;
}

// ── Parse Emprunts sheet ─────────────────────────────────────────────

interface RawEmprunt {
  nomPret: string;
  societe: string;
  banque: string;
  montant: number;
  taux: number;
  dateDebut: string | null;
  capitalRestantDu2025: number | null;
}

function parseEmprunts(wb: XLSX.WorkBook): RawEmprunt[] {
  const sheet = wb.Sheets["Emprunts"];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const emprunts: RawEmprunt[] = [];

  // Row 1 = headers, Row 2 = sub-headers, data from row 3
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0]) continue;
    if (String(r[0]).startsWith("CE_SCI HOCHE") || String(r[0]).startsWith("CE_SCI ARAGO") || String(r[0]).startsWith("BNP_SCI MADELI")) continue; // Skip sold SCIs

    emprunts.push({
      nomPret: str(r[0])!,
      societe: str(r[1]) || "",
      banque: str(r[2]) || "",
      montant: num(r[5]) || 0,
      taux: num(r[6]) || 0,
      dateDebut: excelDateToISO(r[7]),
      // Column 20 = "solde fin 2025"
      capitalRestantDu2025: num(r[20]),
    });
  }
  return emprunts;
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

// Emprunt société → SCI mapping
const SOCIETE_TO_SCI: Record<string, string> = {
  "9-HAUTE": "34 RUE HAUTE",
  "9-LEGRAND": "LEGRAND",
  "9-ORIENT": "ARMEE ORIENT",
  "9-CHENNEVIERES": "CHENNEVIERES",
  "9-TAVERNY": "TAVERNY",
  "9-GJB": "GENERAL JULES BRIMONT",
};

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
  const fileName = "BDD SCI 04 01 2026 - proposition FLE new BDD (5).xlsx";
  // Check same directory first (production: dist/), then parent directory (development)
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
  const bddRows = parseBDD(wb);
  const empruntRows = parseEmprunts(wb);

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
    const uniqueScis = [...new Set(bddRows.map((r) => r.sciName))];

    for (const sciName of uniqueScis) {
      const sciId = id();
      sciIds[sciName] = sciId;

      // Get first row for this SCI (for capital/participation data)
      const firstRow = bddRows.find((r) => r.sciName === sciName)!;

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

    // ─── 3. Create Participations ────────────────────────────────
    // Use first row of each SCI for participation percentages
    for (const sciName of uniqueScis) {
      const firstRow = bddRows.find((r) => r.sciName === sciName)!;
      const sciId = sciIds[sciName];
      const parts = [
        { key: "damien", pct: firstRow.damien },
        { key: "sebastien", pct: firstRow.sebastien },
        { key: "hio", pct: firstRow.hio },
        { key: "axoriel", pct: firstRow.axoriel },
      ];

      for (const p of parts) {
        if (p.pct != null && p.pct > 0) {
          await client.query(
            `INSERT INTO am_participations (id, associe_id, sci_id, pourcentage, created_at) VALUES ($1, $2, $3, $4, now())`,
            [id(), associeIds[p.key], sciId, (p.pct * 100).toFixed(2)]
          );
          counts.participations++;
        }
      }
    }
    logger.info(`import: created ${counts.participations} participations`);

    // ─── 4. Create Actifs (grouped by SCI + adresse) ─────────────
    const actifIds: Record<string, string> = {}; // key = "sciName|adresse"
    const actifGroups: Record<string, RawRow[]> = {};

    for (const r of bddRows) {
      const key = `${r.sciName}|${r.adresse}`;
      if (!actifGroups[key]) actifGroups[key] = [];
      actifGroups[key].push(r);
    }

    for (const [key, rows] of Object.entries(actifGroups)) {
      const first = rows[0];
      const sciName = first.sciName;
      const actifId = id();
      actifIds[key] = actifId;

      // Sum up acquisition price from rows that have it
      const totalPrix = rows.reduce((s, r) => s + (r.prixAcquisition || 0), 0);
      // Use the first row's prix if available, otherwise sum of quote-parts
      const prixAcquisition = totalPrix > 0 ? totalPrix : rows.reduce((s, r) => s + (r.quotePartPrixAchat || 0), 0);

      // Total surface
      const totalSurface = rows.reduce((s, r) => s + (r.surfaceLouee || 0), 0);
      const surfaceTerrain = first.surfaceTerrain;
      const surfacesPrivatives = first.surfacesPrivatives;

      const isCopro = first.copro === "oui";

      await client.query(
        `INSERT INTO am_actifs (id, sci_id, nom, adresse, ville, code_postal, type, surface, surface_carrez,
         reference_cadastrale, prix_acquisition, date_acquisition, regime_juridique, notes, erp, pmi,
         taux_capitalisation, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())`,
        [
          actifId,
          sciIds[sciName],
          first.destination || `${first.adresse}, ${first.ville}`,
          first.adresse,
          first.ville,
          first.codePostal,
          first.destination?.toLowerCase().includes("crèche") ? "commerce" :
            first.destination?.toLowerCase().includes("bureau") ? "bureau" :
            first.destination?.toLowerCase().includes("logement") ? "habitation" : "mixte",
          surfacesPrivatives || surfaceTerrain || totalSurface,
          surfacesPrivatives || totalSurface,
          first.cadastre,
          prixAcquisition > 0 ? prixAcquisition : null,
          first.dateAcquisition,
          isCopro ? "copropriété" : "pleine propriété",
          first.description,
          false,
          false,
          6, // Taux de capitalisation par défaut : 6%
        ]
      );
      counts.actifs++;
    }
    logger.info(`import: created ${counts.actifs} actifs`);

    // ─── 5. Create Locataires ────────────────────────────────────
    const locataireIds: Record<string, string> = {};

    for (const r of bddRows) {
      if (!r.locataire || locataireIds[r.locataire]) continue;
      const locId = id();
      locataireIds[r.locataire] = locId;

      // Try to split "M. BONHOMME" → nom: BONHOMME, prenom: null
      const parts = r.locataire.match(/^(M\.|Mme|M\s|Mme\s)?\s*(.+)$/i);
      const nom = parts ? parts[2].trim() : r.locataire;

      await client.query(
        `INSERT INTO am_locataires (id, nom, notes, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`,
        [locId, nom, r.typeBail ? `Type: ${r.typeBail}` : null]
      );
      counts.locataires++;
    }
    logger.info(`import: created ${counts.locataires} locataires`);

    // ─── 6. Create Lots + Baux (one per BDD row) ────────────────
    for (const r of bddRows) {
      const actifKey = `${r.sciName}|${r.adresse}`;
      const actifId = actifIds[actifKey];
      const sciId = sciIds[r.sciName];

      if (!actifId) {
        logger.warn(`import: no actif found for ${actifKey}`);
        continue;
      }

      // Create Lot
      const lotId = id();
      const loyerAnnuel = r.loyerAnnuelActuel || r.loyerAnnuelDepart;

      await client.query(
        `INSERT INTO am_lots (id, actif_id, sci_id, designation, type, surface, surface_carrez,
         loyer_mensuel, loyer_annuel, statut, locataire_id, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
        [
          lotId,
          actifId,
          sciId,
          r.destination || "Lot principal",
          r.typeBail === "logement" ? "habitation" :
            r.typeBail === "commercial" ? "commercial" :
            r.typeBail === "professionnel" ? "professionnel" : "autre",
          r.surfaceLouee,
          r.surfaceLouee,
          loyerAnnuel ? (loyerAnnuel / 12).toFixed(2) : null,
          loyerAnnuel,
          r.locataire ? "loué" : "vacant",
          r.locataire ? locataireIds[r.locataire] : null,
          r.numLot ? `Lot n°${r.numLot}` : null,
        ]
      );
      counts.lots++;

      // Create Bail if there's a locataire
      if (r.locataire) {
        // Parse indice reference
        let indiceRef: string | null = null;
        let valeurIndice: number | null = null;
        if (r.indiceRevalorisation) {
          if (r.indiceRevalorisation.includes("ILC")) indiceRef = "ILC";
          else if (r.indiceRevalorisation.includes("IRL")) indiceRef = "IRL";
          else if (r.indiceRevalorisation.includes("ICC")) indiceRef = "ICC";
          else if (r.indiceRevalorisation.includes("ILAT")) indiceRef = "ILAT";

          // Try to extract value like "IRL 3T2023 = 141,03"
          const valMatch = r.indiceRevalorisation.match(/=\s*([\d.,]+)/);
          if (valMatch) valeurIndice = num(valMatch[1]);
        }

        // Parse trimestre ref
        let trimestreRef: string | null = null;
        if (r.indiceRevalorisation) {
          const trimMatch = r.indiceRevalorisation.match(/(\d)T(\d{4})/);
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
            locataireIds[r.locataire],
            r.typeBail,
            r.dateDebut,
            r.dateFin,
            loyerAnnuel ? (loyerAnnuel / 12).toFixed(2) : null,
            loyerAnnuel,
            indiceRef,
            trimestreRef,
            valeurIndice,
            "actif",
            r.loyerAnnuelDepart,
            [
              r.soumisTVA === "oui" ? "Soumis à TVA" : null,
              r.garantie ? `Garantie: ${r.garantie}` : null,
            ].filter(Boolean).join("\n") || null,
          ]
        );
        counts.baux++;
      }
    }
    logger.info(`import: created ${counts.lots} lots, ${counts.baux} baux`);

    // ─── 7. Create Emprunts ──────────────────────────────────────
    for (const e of empruntRows) {
      const sciName = SOCIETE_TO_SCI[e.societe];
      if (!sciName || !sciIds[sciName]) {
        // Could be AXORIEL or HIO holding emprunts
        logger.info(`import: skipping emprunt ${e.nomPret} (société ${e.societe})`);
        continue;
      }

      const sciId = sciIds[sciName];

      // Parse duration from emprunt name or data
      let dureeAns: number | null = null;
      // Try to get it from BDD rows
      const sciRows = bddRows.filter((r) => r.sciName === sciName);
      for (const r of sciRows) {
        if (r.banques?.includes(e.banque) && r.duree) {
          const dMatch = r.duree.match(/(\d+)/);
          if (dMatch) dureeAns = Number(dMatch[1]);
          break;
        }
      }

      // Calculate mensualité from yearly data if available
      // We know yearly échéance from the Emprunts sheet
      // Use capitalRestantDu2025 for current outstanding balance

      await client.query(
        `INSERT INTO am_emprunts (id, sci_id, banque, montant_emprunte, capital_restant_du,
         taux_annuel, duree_ans, date_debut, type_amortissement, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
        [
          id(),
          sciId,
          e.banque,
          e.montant,
          e.capitalRestantDu2025,
          e.taux * 100, // Convert from decimal to percentage
          dureeAns,
          e.dateDebut,
          "constant",
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
