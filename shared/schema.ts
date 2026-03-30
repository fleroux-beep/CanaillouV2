import {
  pgTable,
  varchar,
  text,
  integer,
  serial,
  boolean,
  numeric,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// AUTH & SESSIONS
// ============================================================

export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — SCIs & Associés
// ============================================================

export const scis = pgTable("am_scis", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  formeJuridique: varchar("forme_juridique"),
  capital: numeric("capital"),
  regimeFiscal: varchar("regime_fiscal"),
  siret: varchar("siret"),
  adresse: text("adresse"),
  ville: varchar("ville"),
  codePostal: varchar("code_postal"),
  dateCreation: varchar("date_creation"),
  gerant: varchar("gerant"),
  expertComptable: varchar("expert_comptable"),
  banque: varchar("banque"),
  iban: varchar("iban"),
  // SCPI-specific fields
  dateRevente: varchar("date_revente"),
  tauxRendement: numeric("taux_rendement"),
  dividendesRealises: numeric("dividendes_realises"),
  dateClotureExercice: varchar("date_cloture_exercice"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const associes = pgTable("am_associes", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  prenom: varchar("prenom"),
  email: varchar("email"),
  telephone: varchar("telephone"),
  adresse: text("adresse"),
  siret: varchar("siret"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const participations = pgTable("am_participations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  associeId: varchar("associe_id").notNull().references(() => associes.id, { onDelete: "cascade" }),
  sciId: varchar("sci_id").notNull().references(() => scis.id, { onDelete: "cascade" }),
  partsSociales: numeric("parts_sociales"),
  pourcentage: numeric("pourcentage"),
  montantApport: numeric("montant_apport"),
  dateEntree: varchar("date_entree"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — Actifs & Lots
// ============================================================

export const actifs = pgTable("am_actifs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  nom: varchar("nom").notNull(),
  adresse: text("adresse"),
  ville: varchar("ville"),
  codePostal: varchar("code_postal"),
  type: varchar("type"), // résidentiel, commercial, bureau, mixte, crèche
  lat: real("lat"),
  lng: real("lng"),
  surface: numeric("surface"),
  surfaceCarrez: numeric("surface_carrez"),
  referenceCadastrale: varchar("reference_cadastrale"),
  anneeConstruction: integer("annee_construction"),
  dpe: varchar("dpe"),
  erp: boolean("erp").default(false),
  pmi: boolean("pmi").default(false),
  // Acquisition
  prixAcquisition: numeric("prix_acquisition"),
  fraisNotaire: numeric("frais_notaire"),
  fraisAgence: numeric("frais_agence"),
  montantTravaux: numeric("montant_travaux"),
  dateAcquisition: varchar("date_acquisition"),
  // Charges annuelles
  chargesAnnuelles: numeric("charges_annuelles"),
  taxeFonciere: numeric("taxe_fonciere"),
  assurancePno: numeric("assurance_pno"),
  chargesCopropriete: numeric("charges_copropriete"),
  // Valorisation
  tauxCapitalisation: numeric("taux_capitalisation"),
  prixM2Marche: numeric("prix_m2_marche"),
  valeurEstimeeSortie: numeric("valeur_estimee_sortie"),
  dateEstimation: varchar("date_estimation"),
  sourceEstimation: varchar("source_estimation"),
  // Gestion
  syndic: varchar("syndic"),
  regimeJuridique: varchar("regime_juridique"),
  notes: text("notes"),
  archived: boolean("archived").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lots = pgTable("am_lots", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actifId: varchar("actif_id").notNull().references(() => actifs.id, { onDelete: "cascade" }),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  designation: varchar("designation").notNull(),
  type: varchar("type"), // commercial, bureau, habitation, parking, cave
  etage: varchar("etage"),
  surface: numeric("surface"),
  surfaceCarrez: numeric("surface_carrez"),
  dpe: varchar("dpe"),
  // Loyer
  loyerMensuel: numeric("loyer_mensuel"),
  loyerAnnuel: numeric("loyer_annuel"),
  chargesLot: numeric("charges_lot"),
  // Occupation
  statut: varchar("statut").default("vacant"), // loué, vacant
  locataireId: varchar("locataire_id").references(() => locatairesAM.id, { onDelete: "set null" }),
  notes: text("notes"),
  archived: boolean("archived").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — Locataires & Baux
// ============================================================

export const locatairesAM = pgTable("am_locataires", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  prenom: varchar("prenom"),
  email: varchar("email"),
  telephone: varchar("telephone"),
  adresse: text("adresse"),
  siret: varchar("siret"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bauxAM = pgTable("am_baux", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: varchar("lot_id").references(() => lots.id, { onDelete: "set null" }),
  actifId: varchar("actif_id").references(() => actifs.id, { onDelete: "set null" }),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  locataireId: varchar("locataire_id").references(() => locatairesAM.id, { onDelete: "set null" }),
  typeBail: varchar("type_bail"), // habitation, commercial, professionnel
  dateDebut: varchar("date_debut"),
  dateFin: varchar("date_fin"),
  dateSignature: varchar("date_signature"),
  loyerMensuel: numeric("loyer_mensuel"),
  loyerAnnuel: numeric("loyer_annuel"),
  charges: numeric("charges"),
  depotGarantie: numeric("depot_garantie"),
  // Indexation
  indiceReference: varchar("indice_reference"), // IRL, ILC, ILAT, ICC
  trimestreRef: varchar("trimestre_ref"),
  valeurIndiceBase: numeric("valeur_indice_base"),
  // Statut
  statut: varchar("statut").default("actif"), // actif, expiré, résilié
  loyerTheorique: numeric("loyer_theorique"),
  notes: text("notes"),
  archived: boolean("archived").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — Emprunts
// ============================================================

export const emprunts = pgTable("am_emprunts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  actifId: varchar("actif_id").references(() => actifs.id, { onDelete: "set null" }),
  banque: varchar("banque"),
  montantEmprunte: numeric("montant_emprunte"),
  capitalRestantDu: numeric("capital_restant_du"),
  tauxAnnuel: numeric("taux_annuel"),
  taeg: numeric("taeg"),
  dureeAns: integer("duree_ans"),
  dureeMois: integer("duree_mois"),
  dateDebut: varchar("date_debut"),
  dateFin: varchar("date_fin"),
  typeAmortissement: varchar("type_amortissement"), // constant, in-fine, progressif
  mensualite: numeric("mensualite"),
  assuranceMensuelle: numeric("assurance_mensuelle"),
  tauxAssurance: numeric("taux_assurance"),
  typeGarantie: varchar("type_garantie"), // hypothèque, caution, privilège
  ira: numeric("ira"), // indemnité remboursement anticipé
  notes: text("notes"),
  archived: boolean("archived").default(false),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — Travaux
// ============================================================

export const travaux = pgTable("am_travaux", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actifId: varchar("actif_id").references(() => actifs.id, { onDelete: "cascade" }),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  titre: varchar("titre").notNull(),
  description: text("description"),
  budget: numeric("budget"),
  montantReel: numeric("montant_reel"),
  dateDebut: varchar("date_debut"),
  dateFin: varchar("date_fin"),
  statut: varchar("statut").default("planifié"), // planifié, en cours, terminé, annulé
  prestataire: varchar("prestataire"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Bailleurs & Gestionnaires
// ============================================================

export const bailleurs = pgTable("gl_bailleurs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  type: varchar("type"),
  email: varchar("email"),
  telephone: varchar("telephone"),
  adresse: text("adresse"),
  siret: varchar("siret"),
  iban: varchar("iban"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gestionnaires = pgTable("gl_gestionnaires", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  bailleurId: varchar("bailleur_id").references(() => bailleurs.id, { onDelete: "set null" }),
  email: varchar("email"),
  telephone: varchar("telephone"),
  adresse: text("adresse"),
  societe: varchar("societe"),
  siret: varchar("siret"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Locataires (= vous, le preneur)
// ============================================================

export const locatairesGL = pgTable("gl_locataires", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  prenom: varchar("prenom"),
  email: varchar("email"),
  telephone: varchar("telephone"),
  adresse: text("adresse"),
  siret: varchar("siret"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Baux (vous êtes locataire)
// ============================================================

export const bauxGL = pgTable("gl_baux", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nom: varchar("nom").notNull(),
  locataireId: varchar("locataire_id").references(() => locatairesGL.id, { onDelete: "set null" }),
  bailleurId: varchar("bailleur_id").references(() => bailleurs.id, { onDelete: "set null" }),
  gestionnaireId: varchar("gestionnaire_id").references(() => gestionnaires.id, { onDelete: "set null" }),
  typeBail: varchar("type_bail"),
  adresse: text("adresse"),
  ville: varchar("ville"),
  codePostal: varchar("code_postal"),
  lat: real("lat"),
  lng: real("lng"),
  // Dates
  dateSignature: varchar("date_signature"),
  dateEffet: varchar("date_effet"),
  dateDebut: timestamp("date_debut"),
  dateFin: timestamp("date_fin"),
  periodeFermeDebut: varchar("periode_ferme_debut"),
  periodeFermeFin: varchar("periode_ferme_fin"),
  periodeFermeDureeAns: integer("periode_ferme_duree_ans"),
  echTrien1: varchar("ech_trien1"),
  echTrien2: varchar("ech_trien2"),
  echTrien3: varchar("ech_trien3"),
  // Loyer
  loyerBaseHT: numeric("loyer_base_ht"),
  loyerHTActu: numeric("loyer_ht_actu"),
  forceManual: boolean("force_manual").default(false),
  // Indexation
  indiceReference: varchar("indice_reference"),
  trimestreRef: varchar("trimestre_ref"),
  dateIndiceBase: timestamp("date_indice_base"),
  valeurIndiceBase: numeric("valeur_indice_base"),
  // Charges & Taxes
  charges: numeric("charges"),
  depotGarantie: numeric("depot_garantie"),
  taxeFonciere: numeric("taxe_fonciere"),
  taxe: varchar("taxe"), // TVA ou CRL
  tvaTaux: numeric("tva_taux"),
  // Garanties
  garantieType: varchar("garantie_type"),
  garantieMontant: numeric("garantie_montant"),
  // Capacité (crèches)
  surface: numeric("surface"),
  surfaceExterieure: numeric("surface_exterieure"),
  capacite: integer("capacite"),
  // Statut
  statut: varchar("statut"),
  archived: boolean("archived").default(false),
  deletedAt: timestamp("deleted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Paiements, Factures, Quittances
// ============================================================

export const paiementsGL = pgTable("gl_paiements", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  date: varchar("date").notNull(),
  montant: numeric("montant").notNull(),
  type: varchar("type").notNull(),
  methode: varchar("methode"),
  reference: varchar("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const facturesGL = pgTable("gl_factures", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(),
  fileName: varchar("file_name").notNull(),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  dateFacture: varchar("date_facture").notNull(),
  dateEcheance: varchar("date_echeance"),
  montantHT: numeric("montant_ht"),
  montantTTC: numeric("montant_ttc").notNull(),
  reference: varchar("reference"),
  statut: varchar("statut").notNull(),
  datePaiement: varchar("date_paiement"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quittancesGL = pgTable("gl_quittances", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  periodeDebut: varchar("periode_debut").notNull(),
  periodeFin: varchar("periode_fin").notNull(),
  montantLoyer: numeric("montant_loyer"),
  montantCharges: numeric("montant_charges"),
  montantTotal: numeric("montant_total"),
  dateEmission: varchar("date_emission"),
  statut: varchar("statut"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Indexations & Indices
// ============================================================

export const indexationsGL = pgTable("gl_indexations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  dateApplication: varchar("date_application").notNull(),
  ancienLoyer: numeric("ancien_loyer"),
  nouveauLoyer: numeric("nouveau_loyer"),
  indiceBase: numeric("indice_base"),
  indiceNouveau: numeric("indice_nouveau"),
  typeIndice: varchar("type_indice"),
  tauxVariation: numeric("taux_variation"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const indices = pgTable("indices", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: varchar("type").notNull(), // ILC, IRL, ILAT, ICC
  trimestre: varchar("trimestre").notNull(),
  valeur: numeric("valeur").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Avenants & Renouvellements
// ============================================================

export const avenantsGL = pgTable("gl_avenants", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  dateEffet: varchar("date_effet").notNull(),
  dateSignature: varchar("date_signature"),
  champsModifies: text("champs_modifies").notNull(),
  titre: varchar("titre"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const renouvellementsGL = pgTable("gl_renouvellements", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").notNull().references(() => bauxGL.id, { onDelete: "cascade" }),
  dateEffet: varchar("date_effet").notNull(),
  dateSignature: varchar("date_signature"),
  nouvelleDateFin: varchar("nouvelle_date_fin").notNull(),
  champsModifies: text("champs_modifies").notNull(),
  titre: varchar("titre"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// GESTION LOCATIVE — Documents & Alertes
// ============================================================

export const documentsGL = pgTable("gl_documents", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bailId: varchar("bail_id").references(() => bauxGL.id, { onDelete: "set null" }),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(),
  category: varchar("category"),
  storageUrl: text("storage_url"),
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  dateDocument: varchar("date_document"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertes = pgTable("alertes", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  module: varchar("module").notNull(), // "am" ou "gl"
  entityType: varchar("entity_type"),
  entityId: varchar("entity_id"),
  type: varchar("type").notNull(),
  title: varchar("title").notNull(),
  message: text("message"),
  targetDate: varchar("target_date"),
  priority: varchar("priority").default("normal"),
  dismissed: boolean("dismissed").default(false),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// SHARED — Historique & Documents AM
// ============================================================

export const historique = pgTable("historique", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  module: varchar("module").notNull(), // "am" ou "gl"
  type: varchar("type").notNull(),
  entity: varchar("entity").notNull(),
  entityId: varchar("entity_id").notNull(),
  details: text("details"),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentsAM = pgTable("am_documents", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actifId: varchar("actif_id").references(() => actifs.id, { onDelete: "set null" }),
  sciId: varchar("sci_id").references(() => scis.id, { onDelete: "set null" }),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(),
  category: varchar("category"),
  storageUrl: text("storage_url"),
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// ASSET MANAGEMENT — Données de Marché (Référentiel)
// ============================================================

export const refTauxEmprunt = pgTable("ref_taux_emprunt", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: varchar("source").notNull(), // bdf, manuel
  typeActif: varchar("type_actif").notNull(), // résidentiel, commercial, bureau, crèche, mixte
  dureeAns: integer("duree_ans").notNull(), // 7, 10, 15, 20, 25
  taux: numeric("taux").notNull(), // en %
  periode: varchar("periode"), // ex: "2025-03", "T1-2025"
  dateReleve: varchar("date_releve"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const refValeursVenales = pgTable("ref_valeurs_venales", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: varchar("source").notNull(), // dvf, manuel
  codePostal: varchar("code_postal").notNull(),
  ville: varchar("ville"),
  codeInsee: varchar("code_insee"),
  typeBien: varchar("type_bien").notNull(), // appartement, maison, local_commercial, bureau, terrain
  prixM2Median: numeric("prix_m2_median"),
  prixM2Bas: numeric("prix_m2_bas"), // Q1
  prixM2Haut: numeric("prix_m2_haut"), // Q3
  nbTransactions: integer("nb_transactions"),
  periode: varchar("periode"), // ex: "S1-2025"
  dateReleve: varchar("date_releve"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const refValeursLocatives = pgTable("ref_valeurs_locatives", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: varchar("source").notNull(), // anil, oll, manuel, interne
  codePostal: varchar("code_postal").notNull(),
  ville: varchar("ville"),
  codeInsee: varchar("code_insee"),
  typeBien: varchar("type_bien").notNull(), // appartement, maison, local_commercial, bureau, crèche
  loyerM2MensuelMedian: numeric("loyer_m2_mensuel_median"),
  loyerM2MensuelBas: numeric("loyer_m2_mensuel_bas"),
  loyerM2MensuelHaut: numeric("loyer_m2_mensuel_haut"),
  periode: varchar("periode"),
  dateReleve: varchar("date_releve"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const refTauxCapitalisation = pgTable("ref_taux_capitalisation", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: varchar("source").notNull(), // calculé, manuel, immostat
  codePostal: varchar("code_postal").notNull(),
  ville: varchar("ville"),
  codeInsee: varchar("code_insee"),
  typeBien: varchar("type_bien").notNull(), // appartement, maison, local_commercial, bureau, crèche
  tauxCapi: numeric("taux_capi").notNull(), // en %
  tauxCapiBas: numeric("taux_capi_bas"),
  tauxCapiHaut: numeric("taux_capi_haut"),
  fiabilite: varchar("fiabilite"), // haute, moyenne, faible
  methodeCalcul: varchar("methode_calcul"), // ex: "DVF S2-2025 / ANIL 2025"
  periode: varchar("periode"),
  dateReleve: varchar("date_releve"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// MARCHÉ — Données scrapées (Phase 2)
// ============================================================

export const refMarcheScraping = pgTable("ref_marche_scraping", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actifId: varchar("actif_id").references(() => actifs.id, { onDelete: "cascade" }),
  source: varchar("source").notNull(), // meilleursagents, leboncoin, seloger, seloger_bc, pap, bureauxlocaux
  typeRecherche: varchar("type_recherche").notNull(), // vente, location
  typeBien: varchar("type_bien").notNull(), // appartement, maison, bureau, commerce, local_commercial
  // Prix
  prixM2Median: numeric("prix_m2_median"),
  prixM2Bas: numeric("prix_m2_bas"),
  prixM2Haut: numeric("prix_m2_haut"),
  // Loyers (si typeRecherche = location)
  loyerM2MensuelMedian: numeric("loyer_m2_mensuel_median"),
  loyerM2MensuelBas: numeric("loyer_m2_mensuel_bas"),
  loyerM2MensuelHaut: numeric("loyer_m2_mensuel_haut"),
  // Contexte
  nbAnnonces: integer("nb_annonces"),
  rayonKm: numeric("rayon_km"),
  lat: real("lat"),
  lng: real("lng"),
  codePostal: varchar("code_postal"),
  ville: varchar("ville"),
  // Taux capi déduit
  tauxCapiDeduit: numeric("taux_capi_deduit"),
  // Meta
  dateReleve: varchar("date_releve"),
  rawData: jsonb("raw_data"), // données brutes pour debug
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// MARCHÉ — Études de marché IA
// ============================================================

export const etudesIA = pgTable("am_etudes_ia", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actifId: varchar("actif_id").notNull().references(() => actifs.id, { onDelete: "cascade" }),
  // Phase 1 context used for analysis
  phase1Data: jsonb("phase1_data"), // DVF/ANIL data snapshot
  // AI analysis result (structured JSON)
  positionnement: jsonb("positionnement"),   // { loyerVsMarche, prixVsMarche, commentaire }
  potentiel: jsonb("potentiel"),             // { margeLoyer, plusValue, commentaire }
  risques: jsonb("risques"),                 // [{ type, niveau, description }]
  recommandations: jsonb("recommandations"), // [{ action, priorite, impact, detail }]
  comparables: jsonb("comparables"),         // [{ description, prix, surface, distance }]
  synthese: text("synthese"),                // résumé global texte
  // Meta
  confidence: varchar("confidence"),         // A, B, C, D, E
  model: varchar("model"),                   // claude model used
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// RELATIONS (for Drizzle relational queries)
// ============================================================

export const scisRelations = relations(scis, ({ many }) => ({
  actifs: many(actifs),
  participations: many(participations),
  emprunts: many(emprunts),
}));

export const actifsRelations = relations(actifs, ({ one, many }) => ({
  sci: one(scis, { fields: [actifs.sciId], references: [scis.id] }),
  lots: many(lots),
  baux: many(bauxAM),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  actif: one(actifs, { fields: [lots.actifId], references: [actifs.id] }),
  baux: many(bauxAM),
}));

export const bauxAMRelations = relations(bauxAM, ({ one }) => ({
  actif: one(actifs, { fields: [bauxAM.actifId], references: [actifs.id] }),
  lot: one(lots, { fields: [bauxAM.lotId], references: [lots.id] }),
  locataire: one(locatairesAM, { fields: [bauxAM.locataireId], references: [locatairesAM.id] }),
  sci: one(scis, { fields: [bauxAM.sciId], references: [scis.id] }),
}));

export const empruntsRelations = relations(emprunts, ({ one }) => ({
  sci: one(scis, { fields: [emprunts.sciId], references: [scis.id] }),
  actif: one(actifs, { fields: [emprunts.actifId], references: [actifs.id] }),
}));

export const participationsRelations = relations(participations, ({ one }) => ({
  associe: one(associes, { fields: [participations.associeId], references: [associes.id] }),
  sci: one(scis, { fields: [participations.sciId], references: [scis.id] }),
}));

export const associesRelations = relations(associes, ({ many }) => ({
  participations: many(participations),
}));

export const bailleursRelations = relations(bailleurs, ({ many }) => ({
  baux: many(bauxGL),
}));

export const bauxGLRelations = relations(bauxGL, ({ one, many }) => ({
  bailleur: one(bailleurs, { fields: [bauxGL.bailleurId], references: [bailleurs.id] }),
  locataire: one(locatairesGL, { fields: [bauxGL.locataireId], references: [locatairesGL.id] }),
  gestionnaire: one(gestionnaires, { fields: [bauxGL.gestionnaireId], references: [gestionnaires.id] }),
  paiements: many(paiementsGL),
  indexations: many(indexationsGL),
  quittances: many(quittancesGL),
}));

export const paiementsGLRelations = relations(paiementsGL, ({ one }) => ({
  bail: one(bauxGL, { fields: [paiementsGL.bailId], references: [bauxGL.id] }),
}));

export const indexationsGLRelations = relations(indexationsGL, ({ one }) => ({
  bail: one(bauxGL, { fields: [indexationsGL.bailId], references: [bauxGL.id] }),
}));
