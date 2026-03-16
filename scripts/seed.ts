import { db } from "../server/db";
import {
  scis,
  actifs,
  lots,
  locatairesAM,
  bauxAM,
  emprunts,
  associes,
  participations,
} from "../shared/schema";

// ============================================================
// Helpers
// ============================================================

const sciIds: Record<string, string> = {};
const actifIds: Record<string, string> = {};
const lotIds: Record<string, string> = {};
const empruntIds: Record<string, string> = {};
const associeIds: Record<string, string> = {};
const locataireIds: Record<string, string> = {};

function uuid(): string {
  return crypto.randomUUID();
}

// ============================================================
// DATA FROM EXCEL
// ============================================================

async function seed() {
  console.log("🌱 Seeding database...");

  // ----------------------------------------------------------
  // 1. SCIs
  // ----------------------------------------------------------
  const scisData = [
    { ref: "SCI-001", nom: "SCI 34 RUE HAUTE", formeJuridique: "SCI", regimeFiscal: "IS", notes: null },
    { ref: "SCI-002", nom: "SCI LEGRAND", formeJuridique: "SCI", regimeFiscal: "IS", notes: "Démembrement: oui usufruit SAS" },
    { ref: "SCI-003", nom: "SCI ARMEE ORIENT", formeJuridique: "SCI", regimeFiscal: "IS", notes: null },
    { ref: "SCI-004", nom: "SCI CHENNEVIERES", formeJuridique: "SCI", regimeFiscal: "IS", notes: null },
    { ref: "SCI-005", nom: "SCI TAVERNY", formeJuridique: "SCI", regimeFiscal: "IS", notes: null },
    { ref: "SCI-006", nom: "SCI GENERAL JULES BRIMONT", formeJuridique: "SCI", regimeFiscal: "IS", notes: null },
  ];

  for (const s of scisData) {
    const id = uuid();
    sciIds[s.ref] = id;
    await db.insert(scis).values({
      id,
      nom: s.nom,
      formeJuridique: s.formeJuridique,
      regimeFiscal: s.regimeFiscal,
      notes: s.notes,
    });
  }
  console.log(`  ✅ ${scisData.length} SCIs`);

  // ----------------------------------------------------------
  // 2. Actifs
  // ----------------------------------------------------------
  const actifsData = [
    { ref: "ACT-001", sciRef: "SCI-001", nom: "DEUIL LA BARRE - 34 RUE HAUTE", adresse: "34 RUE HAUTE", codePostal: "95170", ville: "DEUIL LA BARRE", surface: "1265", prixAcquisition: "380000", dateAcquisition: "2021-12-28", referenceCadastrale: "AE273;AE1086;AE1177", notes: "une maison à usage d'habitation et son terrain" },
    { ref: "ACT-002", sciRef: "SCI-002", nom: "NOISY LE GRAND - 12 BD DU MONT D'EST", adresse: "12 BD DU MONT D'EST", codePostal: "93160", ville: "NOISY LE GRAND", surface: "11637", prixAcquisition: "250000", dateAcquisition: "2017-08-18", referenceCadastrale: "BO168 et BO163", notes: "immeuble de 5 étages avec parking jardin et cour. Copropriété." },
    { ref: "ACT-003", sciRef: "SCI-002", nom: "SCEAUX - 146/148 RUE HOUDAN", adresse: "146/148 RUE HOUDAN", codePostal: "92330", ville: "SCEAUX", surface: "807", prixAcquisition: "780000", dateAcquisition: "2018-07-03", referenceCadastrale: "E174", notes: "immeuble. Copropriété." },
    { ref: "ACT-004", sciRef: "SCI-003", nom: "EPONE - Route de Velannes", adresse: "Route de Velannes", codePostal: "78680", ville: "EPONE", surface: null, prixAcquisition: "352908", dateAcquisition: "2022-07-09", referenceCadastrale: "J1451-1641-1473-1477-1478-1482-1481-1486-1480", notes: "ensemble immobilier formé par un local d'activité et son jardin" },
    { ref: "ACT-005", sciRef: "SCI-003", nom: "NICE - 8 rue Armée D'Orient", adresse: "8 rue Armée D'Orient", codePostal: "06300", ville: "NICE", surface: null, prixAcquisition: "665000", dateAcquisition: "2022-07-07", referenceCadastrale: null, notes: "Copropriété." },
    { ref: "ACT-006", sciRef: "SCI-004", nom: "CHENNEVIERES SUR MARNE - 49 rue Aristide Briand", adresse: "49 rue Aristide Briand", codePostal: "94430", ville: "CHENNEVIERES SUR MARNE", surface: null, prixAcquisition: "734000", dateAcquisition: "2022-07-01", referenceCadastrale: null, notes: "VEFA le 01/07/2022" },
    { ref: "ACT-007", sciRef: "SCI-004", nom: "ALFORTVILLE - 105 rue Etienne Dolet", adresse: "105 rue Etienne Dolet", codePostal: "94140", ville: "ALFORTVILLE", surface: null, prixAcquisition: "840000", dateAcquisition: "2023-05-09", referenceCadastrale: null, notes: "Local commercial. Copropriété." },
    { ref: "ACT-008", sciRef: "SCI-005", nom: "TAVERNY - 3 rue des Ecoles", adresse: "3 rue des Ecoles", codePostal: "95150", ville: "TAVERNY", surface: null, prixAcquisition: "1337730.6", dateAcquisition: "2022-11-24", referenceCadastrale: null, notes: "ensemble immobilier. Copropriété." },
    { ref: "ACT-009", sciRef: "SCI-006", nom: "CHATOU - 32 avenue de Brimont", adresse: "32 avenue de Brimont", codePostal: "78400", ville: "CHATOU", surface: null, prixAcquisition: "1200000", dateAcquisition: "2023-07-21", referenceCadastrale: "AR39-42", notes: "Local à usage d'activité. Copropriété." },
    { ref: "ACT-010", sciRef: "SCI-006", nom: "CHATOU - 30 ter avenue de Brimont", adresse: "30 ter avenue de Brimont", codePostal: "78400", ville: "CHATOU", surface: null, prixAcquisition: null, dateAcquisition: "2023-07-21", referenceCadastrale: null, notes: "Local à usage d'activité. Copropriété." },
    { ref: "ACT-011", sciRef: "SCI-006", nom: "PLESSIS BOUCHARD - 56 Chaussée Jules César", adresse: "56 Chaussée Jules César", codePostal: "95130", ville: "PLESSIS BOUCHARD", surface: null, prixAcquisition: "740000", dateAcquisition: "2023-10-06", referenceCadastrale: null, notes: "Maison individuelle" },
  ];

  for (const a of actifsData) {
    const id = uuid();
    actifIds[a.ref] = id;
    await db.insert(actifs).values({
      id,
      sciId: sciIds[a.sciRef],
      nom: a.nom,
      adresse: a.adresse,
      codePostal: a.codePostal,
      ville: a.ville,
      surface: a.surface,
      prixAcquisition: a.prixAcquisition,
      dateAcquisition: a.dateAcquisition,
      referenceCadastrale: a.referenceCadastrale,
      notes: a.notes,
    });
  }
  console.log(`  ✅ ${actifsData.length} Actifs`);

  // ----------------------------------------------------------
  // 3. Lots
  // ----------------------------------------------------------
  const lotsData = [
    { ref: "LOT-001", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Crèche", surface: "395", type: "commercial" },
    { ref: "LOT-002", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Ecole", surface: "174", type: "bureau" },
    { ref: "LOT-003", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Logement 1 - appartement avec terrasse et jardin RDC", surface: "43.4", type: "habitation" },
    { ref: "LOT-004", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Logement 2 - appartement RDC", surface: "27.7", type: "habitation" },
    { ref: "LOT-005", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Logement 3 - 1er étage à droite", surface: "45.4", type: "habitation" },
    { ref: "LOT-006", actifRef: "ACT-001", sciRef: "SCI-001", designation: "Logement 4 - 1er étage à gauche", surface: "57.7", type: "habitation" },
    { ref: "LOT-007", actifRef: "ACT-002", sciRef: "SCI-002", designation: "Crèche Noisy", surface: "231.1", type: "bureau" },
    { ref: "LOT-008", actifRef: "ACT-003", sciRef: "SCI-002", designation: "Crèche Sceaux", surface: "192", type: "commercial" },
    { ref: "LOT-009", actifRef: "ACT-004", sciRef: "SCI-003", designation: "Crèche Epone", surface: "311", type: "commercial" },
    { ref: "LOT-010", actifRef: "ACT-005", sciRef: "SCI-003", designation: "Crèche Nice", surface: "201", type: "commercial" },
    { ref: "LOT-011", actifRef: "ACT-006", sciRef: "SCI-004", designation: "Crèche Chennevières", surface: "206", type: "commercial" },
    { ref: "LOT-012", actifRef: "ACT-007", sciRef: "SCI-004", designation: "Crèche Alfortville", surface: "311.4", type: "commercial" },
    { ref: "LOT-013", actifRef: "ACT-008", sciRef: "SCI-005", designation: "Crèche Taverny", surface: null, type: "commercial" },
    { ref: "LOT-014", actifRef: "ACT-009", sciRef: "SCI-006", designation: "Crèche Chatou", surface: "258.7", type: "commercial" },
    { ref: "LOT-015", actifRef: "ACT-010", sciRef: "SCI-006", designation: "Bureau au RDC", surface: "15.2", type: "bureau" },
    { ref: "LOT-016", actifRef: "ACT-010", sciRef: "SCI-006", designation: "Local professionnel", surface: "11.15", type: "bureau" },
    { ref: "LOT-017", actifRef: "ACT-010", sciRef: "SCI-006", designation: "Local professionnel", surface: "16.5", type: "bureau" },
    { ref: "LOT-018", actifRef: "ACT-010", sciRef: "SCI-006", designation: "Bureau au RDC", surface: "33", type: "bureau" },
    { ref: "LOT-019", actifRef: "ACT-010", sciRef: "SCI-006", designation: "Bureau au RDC", surface: "11.25", type: "bureau" },
    { ref: "LOT-020", actifRef: "ACT-011", sciRef: "SCI-006", designation: "Crèche LPB", surface: "396.34", type: "commercial" },
  ];

  for (const l of lotsData) {
    const id = uuid();
    lotIds[l.ref] = id;
    await db.insert(lots).values({
      id,
      actifId: actifIds[l.actifRef],
      sciId: sciIds[l.sciRef],
      designation: l.designation,
      surface: l.surface,
      type: l.type,
      statut: "loué",
    });
  }
  console.log(`  ✅ ${lotsData.length} Lots`);

  // ----------------------------------------------------------
  // 4. Locataires (dédupliqués depuis les baux)
  // ----------------------------------------------------------
  const locatairesData = [
    { ref: "LOC-001", nom: "LPC LE LAC" },
    { ref: "LOC-002", nom: "CESAP" },
    { ref: "LOC-003", nom: "M. BONHOMME" },
    { ref: "LOC-004", nom: "M. LEPAGE" },
    { ref: "LOC-005", nom: "Mme CHERIF" },
    { ref: "LOC-006", nom: "M. SAIDI" },
    { ref: "LOC-007", nom: "LPC LE GRAND" },
    { ref: "LOC-008", nom: "LPC SCEAUX" },
    { ref: "LOC-009", nom: "LPC MEDERIC" },
    { ref: "LOC-010", nom: "LPC FREJUS" },
    { ref: "LOC-011", nom: "LPC VAL DE MARNE" },
    { ref: "LOC-012", nom: "LPC TAVERNY" },
    { ref: "LOC-013", nom: "LPC YVELINES" },
    { ref: "LOC-014", nom: "Petits Fils (Pierre Jacques & Co)" },
    { ref: "LOC-015", nom: "Mme BARREIRO (diététicienne)" },
    { ref: "LOC-016", nom: "Mme JOUBERT (Psychomotricienne)" },
    { ref: "LOC-017", nom: "Mme DENANT (Pédicure)" },
    { ref: "LOC-018", nom: "Mme DIAZ COURTENAY MAYERS (Pédopsy)" },
    { ref: "LOC-019", nom: "SARL VAL D'OISE" },
  ];

  for (const l of locatairesData) {
    const id = uuid();
    locataireIds[l.ref] = id;
    await db.insert(locatairesAM).values({ id, nom: l.nom });
  }
  console.log(`  ✅ ${locatairesData.length} Locataires`);

  // ----------------------------------------------------------
  // 5. Baux
  // ----------------------------------------------------------
  const bauxData = [
    { ref: "BAIL-001", lotRef: "LOT-001", sciRef: "SCI-001", locRef: "LOC-001", typeBail: "commercial", dateDebut: "2022-01-01", dateFin: "2030-12-31", loyerAnnuel: "87000", indiceReference: "ILC", loyerTheorique: null, notes: "Soumis TVA: non" },
    { ref: "BAIL-002", lotRef: "LOT-002", sciRef: "SCI-001", locRef: "LOC-002", typeBail: "professionnel", dateDebut: "2024-04-30", dateFin: "2033-04-29", loyerAnnuel: "30600", indiceReference: "ICC", loyerTheorique: "30373.54", notes: "ICC 4T2023 = 2162. Soumis TVA: non" },
    { ref: "BAIL-003", lotRef: "LOT-003", sciRef: "SCI-001", locRef: "LOC-003", typeBail: "habitation", dateDebut: "2023-12-01", dateFin: "2029-11-30", loyerAnnuel: "10740", indiceReference: "IRL", loyerTheorique: null, notes: "IRL 3T2023 = 141.03. Soumis TVA: non" },
    { ref: "BAIL-004", lotRef: "LOT-004", sciRef: "SCI-001", locRef: "LOC-004", typeBail: "habitation", dateDebut: "2023-11-04", dateFin: "2029-11-03", loyerAnnuel: "7080", indiceReference: "IRL", loyerTheorique: null, notes: "IRL 3T2023 = 141.03. Soumis TVA: non" },
    { ref: "BAIL-005", lotRef: "LOT-005", sciRef: "SCI-001", locRef: "LOC-005", typeBail: "habitation", dateDebut: "2024-05-16", dateFin: "2030-05-15", loyerAnnuel: "10440", indiceReference: "IRL", loyerTheorique: null, notes: "IRL 1T2024 = 143.46. Soumis TVA: non" },
    { ref: "BAIL-006", lotRef: "LOT-006", sciRef: "SCI-001", locRef: "LOC-006", typeBail: "habitation", dateDebut: "2024-06-01", dateFin: "2030-05-31", loyerAnnuel: "12780", indiceReference: "IRL", loyerTheorique: null, notes: "IRL 1T2024 = 143.46. Soumis TVA: non" },
    { ref: "BAIL-007", lotRef: "LOT-007", sciRef: "SCI-002", locRef: "LOC-007", typeBail: "commercial", dateDebut: "2018-04-01", dateFin: "2028-03-31", loyerAnnuel: "31284", indiceReference: "ILC", loyerTheorique: "38883.16", notes: "ILC 2T2017 = 110. Soumis TVA: non" },
    { ref: "BAIL-008", lotRef: "LOT-008", sciRef: "SCI-002", locRef: "LOC-008", typeBail: "commercial", dateDebut: "2018-07-01", dateFin: "2028-06-30", loyerAnnuel: "62000", indiceReference: "ILC", loyerTheorique: "70894.04", notes: "ILC 1T2018 = 127.22. Soumis TVA: non" },
    { ref: "BAIL-009", lotRef: "LOT-009", sciRef: "SCI-003", locRef: "LOC-009", typeBail: "commercial", dateDebut: "2023-01-01", dateFin: "2035-01-31", loyerAnnuel: "59090", indiceReference: "ILC", loyerTheorique: "60880", notes: "Soumis TVA: non" },
    { ref: "BAIL-010", lotRef: "LOT-010", sciRef: "SCI-003", locRef: "LOC-010", typeBail: "commercial", dateDebut: "2023-01-01", dateFin: "2032-01-31", loyerAnnuel: "55000", indiceReference: "ILC", loyerTheorique: "60049.56", notes: "Soumis TVA: non" },
    { ref: "BAIL-011", lotRef: "LOT-011", sciRef: "SCI-004", locRef: "LOC-011", typeBail: "commercial", dateDebut: "2023-09-01", dateFin: "2033-08-31", loyerAnnuel: "75240", indiceReference: "ILC", loyerTheorique: "78689.76", notes: "Soumis TVA: non" },
    { ref: "BAIL-012", lotRef: "LOT-012", sciRef: "SCI-004", locRef: "LOC-011", typeBail: "commercial", dateDebut: "2024-01-01", dateFin: "2023-12-31", loyerAnnuel: "86100", indiceReference: "ILC", loyerTheorique: "88708.88", notes: "Soumis TVA: non" },
    { ref: "BAIL-013", lotRef: "LOT-013", sciRef: "SCI-005", locRef: "LOC-012", typeBail: "commercial", dateDebut: "2026-09-01", dateFin: null, loyerAnnuel: "67000", indiceReference: null, loyerTheorique: null, notes: null },
    { ref: "BAIL-014", lotRef: "LOT-014", sciRef: "SCI-006", locRef: "LOC-013", typeBail: "commercial", dateDebut: "2023-09-01", dateFin: "2032-08-31", loyerAnnuel: "84000", indiceReference: "ILC", loyerTheorique: "87851.4", notes: "Soumis TVA: non" },
    { ref: "BAIL-015", lotRef: "LOT-015", sciRef: "SCI-006", locRef: "LOC-014", typeBail: "commercial", dateDebut: "2025-03-01", dateFin: "2028-02-29", loyerAnnuel: "10865.28", indiceReference: "ILC", loyerTheorique: "10865.28", notes: "Bail dérogatoire au statut des baux commerciaux. ILC 3T2024. Soumis TVA: non" },
    { ref: "BAIL-016", lotRef: "LOT-016", sciRef: "SCI-006", locRef: "LOC-015", typeBail: "professionnel", dateDebut: "2025-08-26", dateFin: "2031-08-25", loyerAnnuel: "3185", indiceReference: "ICC", loyerTheorique: "3185", notes: "ICC 4T2024 = 2108. Soumis TVA: non" },
    { ref: "BAIL-017", lotRef: "LOT-017", sciRef: "SCI-006", locRef: "LOC-016", typeBail: "professionnel", dateDebut: "2025-08-26", dateFin: "2031-08-25", loyerAnnuel: "11788.32", indiceReference: "ICC", loyerTheorique: "11788.32", notes: "ICC 3T2024 = 2143. Soumis TVA: non" },
    { ref: "BAIL-018", lotRef: "LOT-018", sciRef: "SCI-006", locRef: "LOC-017", typeBail: "commercial", dateDebut: "2016-11-02", dateFin: "2025-11-02", loyerAnnuel: "7084", indiceReference: "ILAT", loyerTheorique: "8391.96", notes: "Soumis TVA: non" },
    { ref: "BAIL-019", lotRef: "LOT-019", sciRef: "SCI-006", locRef: "LOC-018", typeBail: "professionnel", dateDebut: "2025-05-15", dateFin: "2025-05-14", loyerAnnuel: "8040.24", indiceReference: "ICC", loyerTheorique: "8040.24", notes: "ICC 4T2024 = 2108. Soumis TVA: non" },
    { ref: "BAIL-020", lotRef: "LOT-020", sciRef: "SCI-006", locRef: "LOC-019", typeBail: "commercial", dateDebut: "2024-01-01", dateFin: "2033-12-31", loyerAnnuel: "80000", indiceReference: "ILC", loyerTheorique: "82424.08", notes: "Soumis TVA: non" },
  ];

  for (const b of bauxData) {
    await db.insert(bauxAM).values({
      lotId: lotIds[b.lotRef],
      actifId: actifIds[lotsData.find(l => l.ref === b.lotRef)!.actifRef],
      sciId: sciIds[b.sciRef],
      locataireId: locataireIds[b.locRef],
      typeBail: b.typeBail,
      dateDebut: b.dateDebut,
      dateFin: b.dateFin,
      loyerAnnuel: b.loyerAnnuel,
      indiceReference: b.indiceReference,
      loyerTheorique: b.loyerTheorique,
      notes: b.notes,
    });
  }
  console.log(`  ✅ ${bauxData.length} Baux`);

  // ----------------------------------------------------------
  // 6. Emprunts (only those linked to active SCIs)
  // ----------------------------------------------------------
  const empruntsData = [
    { ref: "EMP-002", sciRef: "SCI-001", banque: "CE", montant: "409000", taux: "0.0135", dateDebut: "2022-04-05", capitalRestant: "305556.77", notes: "CE_SCI 34 HAUTE" },
    { ref: "EMP-003", sciRef: "SCI-001", banque: "CE", montant: "1515000", taux: "0.0135", dateDebut: "2022-09-10", capitalRestant: "1175368.78", notes: "CE_SCI 34 HAUTE - Compte 220154G" },
    { ref: "EMP-004", sciRef: "SCI-001", banque: "SG", montant: "350000", taux: "0.0353", dateDebut: "2025-02-13", capitalRestant: "308928.85", notes: "SG_SCI 34 HAUTE - Compte 225003100788" },
    { ref: "EMP-005", sciRef: "SCI-002", banque: "BNP", montant: "239977.57", taux: "0.01", dateDebut: "2018-01-18", capitalRestant: "5217.07", notes: "BNP_SCI LEGRAND" },
    { ref: "EMP-008", sciRef: "SCI-002", banque: "SG", montant: "780000", taux: "0.0189", dateDebut: "2018-08-03", capitalRestant: "421888.91", notes: "SG_SCI LEGRAND" },
    { ref: "EMP-009", sciRef: "SCI-003", banque: "CA", montant: "665000", taux: "0.014", dateDebut: "2023-04-05", capitalRestant: "553109.81", notes: "CA_SCI ORIENT" },
    { ref: "EMP-010", sciRef: "SCI-003", banque: "LCL", montant: "377612", taux: "0.018", dateDebut: "2023-02-07", capitalRestant: "309355.54", notes: "LCL_SCI ORIENT" },
    { ref: "EMP-011", sciRef: "SCI-004", banque: "LCL", montant: "734000", taux: "0.046", dateDebut: "2023-10-28", capitalRestant: "685859.27", notes: "LCL_SCI CHENNEVIERES - Compte 23925728" },
    { ref: "EMP-012", sciRef: "SCI-005", banque: "CE", montant: "1408923", taux: "0.0493", dateDebut: "2024-02-05", capitalRestant: "1357225.85", notes: "CE_SCI TAVERNY" },
    { ref: "EMP-013", sciRef: "SCI-006", banque: "CE", montant: "1200000", taux: "0.051", dateDebut: "2023-08-25", capitalRestant: "1092667.85", notes: "CE_SCI CHATOU" },
    { ref: "EMP-014", sciRef: "SCI-006", banque: "LCL", montant: "740000", taux: "0.046", dateDebut: "2024-07-30", capitalRestant: "686767.34", notes: "LCL_SCI PLESSIS" },
    { ref: "EMP-015", sciRef: "SCI-004", banque: "SG", montant: "840000", taux: "0.0453", dateDebut: "2023-12-15", capitalRestant: "792256.82", notes: "SG_SCI ALFORTVILLE - Compte 223326101166" },
  ];

  for (const e of empruntsData) {
    const id = uuid();
    empruntIds[e.ref] = id;
    await db.insert(emprunts).values({
      id,
      sciId: sciIds[e.sciRef],
      banque: e.banque,
      montantEmprunte: e.montant,
      tauxAnnuel: e.taux,
      dateDebut: e.dateDebut,
      capitalRestantDu: e.capitalRestant,
      notes: e.notes,
    });
  }
  console.log(`  ✅ ${empruntsData.length} Emprunts`);

  // ----------------------------------------------------------
  // 7. Associés & Participations
  // ----------------------------------------------------------
  // Unique associés
  const uniqueAssocies = [
    { ref: "Damien", nom: "Damien", type: "personne_physique" },
    { ref: "Sébastien", nom: "Sébastien", type: "personne_physique" },
    { ref: "HIO", nom: "HIO", type: "personne_morale" },
    { ref: "AXORIEL", nom: "AXORIEL", type: "personne_morale" },
  ];

  for (const a of uniqueAssocies) {
    const id = uuid();
    associeIds[a.ref] = id;
    await db.insert(associes).values({
      id,
      nom: a.nom,
      notes: `Type: ${a.type}`,
    });
  }
  console.log(`  ✅ ${uniqueAssocies.length} Associés`);

  // Participations
  const participationsData = [
    // SCI-001
    { associeRef: "Damien", sciRef: "SCI-001", pourcentage: "0.01" },
    { associeRef: "Sébastien", sciRef: "SCI-001", pourcentage: "0.01" },
    { associeRef: "HIO", sciRef: "SCI-001", pourcentage: "49.99" },
    { associeRef: "AXORIEL", sciRef: "SCI-001", pourcentage: "49.99" },
    // SCI-002
    { associeRef: "Damien", sciRef: "SCI-002", pourcentage: "50" },
    { associeRef: "Sébastien", sciRef: "SCI-002", pourcentage: "50" },
    // SCI-003
    { associeRef: "Damien", sciRef: "SCI-003", pourcentage: "0.01" },
    { associeRef: "Sébastien", sciRef: "SCI-003", pourcentage: "0.01" },
    { associeRef: "HIO", sciRef: "SCI-003", pourcentage: "49.99" },
    { associeRef: "AXORIEL", sciRef: "SCI-003", pourcentage: "49.99" },
    // SCI-004
    { associeRef: "Damien", sciRef: "SCI-004", pourcentage: "0.01" },
    { associeRef: "Sébastien", sciRef: "SCI-004", pourcentage: "0.01" },
    { associeRef: "HIO", sciRef: "SCI-004", pourcentage: "49.99" },
    { associeRef: "AXORIEL", sciRef: "SCI-004", pourcentage: "49.99" },
    // SCI-005
    { associeRef: "Damien", sciRef: "SCI-005", pourcentage: "0.01" },
    { associeRef: "Sébastien", sciRef: "SCI-005", pourcentage: "0.01" },
    { associeRef: "HIO", sciRef: "SCI-005", pourcentage: "49.99" },
    { associeRef: "AXORIEL", sciRef: "SCI-005", pourcentage: "49.99" },
    // SCI-006
    { associeRef: "Damien", sciRef: "SCI-006", pourcentage: "0.01" },
    { associeRef: "Sébastien", sciRef: "SCI-006", pourcentage: "0.01" },
    { associeRef: "HIO", sciRef: "SCI-006", pourcentage: "49.99" },
    { associeRef: "AXORIEL", sciRef: "SCI-006", pourcentage: "49.99" },
  ];

  for (const p of participationsData) {
    await db.insert(participations).values({
      associeId: associeIds[p.associeRef],
      sciId: sciIds[p.sciRef],
      pourcentage: p.pourcentage,
    });
  }
  console.log(`  ✅ ${participationsData.length} Participations`);

  console.log("\n🎉 Seed complete!");
  console.log("\n⚠️  Note: les onglets 'echeances_emprunt', 'financement_lots' et 'scis_vendues'");
  console.log("   n'ont pas de tables correspondantes dans le schéma actuel.");
  console.log("   Ces données pourront être ajoutées ultérieurement si nécessaire.");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
