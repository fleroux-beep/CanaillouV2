import { pool } from "./db";
import { logger } from "./lib/logger";

/**
 * Ensures all database tables exist by running CREATE TABLE IF NOT EXISTS.
 * This replaces drizzle-kit push / drizzle-orm migrate which don't work
 * when the server is bundled with esbuild (fs-based migration files are unavailable).
 */
export async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Sessions (connect-pg-simple expects "session" singular by default)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
      )
    `);
    // Rename legacy plural table if it exists and the singular one is empty
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions')
        THEN
          INSERT INTO "session" SELECT * FROM "sessions" ON CONFLICT DO NOTHING;
          DROP TABLE "sessions";
        END IF;
      END $$;
    `);

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL,
        "password" varchar NOT NULL,
        "first_name" varchar,
        "last_name" varchar,
        "role" varchar(20) DEFAULT 'user' NOT NULL,
        "is_approved" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "users_email_unique" UNIQUE("email")
      )
    `);

    // SCIs
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_scis" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "forme_juridique" varchar,
        "capital" numeric,
        "regime_fiscal" varchar,
        "siret" varchar,
        "adresse" text,
        "ville" varchar,
        "code_postal" varchar,
        "date_creation" varchar,
        "gerant" varchar,
        "expert_comptable" varchar,
        "banque" varchar,
        "iban" varchar,
        "date_revente" varchar,
        "taux_rendement" numeric,
        "dividendes_realises" numeric,
        "date_cloture_exercice" varchar,
        "notes" text,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Associés
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_associes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "prenom" varchar,
        "email" varchar,
        "telephone" varchar,
        "adresse" text,
        "siret" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Actifs
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_actifs" (
        "id" varchar PRIMARY KEY NOT NULL,
        "sci_id" varchar,
        "nom" varchar NOT NULL,
        "adresse" text,
        "ville" varchar,
        "code_postal" varchar,
        "type" varchar,
        "lat" real,
        "lng" real,
        "surface" numeric,
        "surface_carrez" numeric,
        "reference_cadastrale" varchar,
        "annee_construction" integer,
        "dpe" varchar,
        "erp" boolean DEFAULT false,
        "pmi" boolean DEFAULT false,
        "prix_acquisition" numeric,
        "frais_notaire" numeric,
        "frais_agence" numeric,
        "montant_travaux" numeric,
        "date_acquisition" varchar,
        "charges_annuelles" numeric,
        "taxe_fonciere" numeric,
        "assurance_pno" numeric,
        "charges_copropriete" numeric,
        "taux_capitalisation" numeric,
        "prix_m2_marche" numeric,
        "valeur_estimee_sortie" numeric,
        "date_estimation" varchar,
        "source_estimation" varchar,
        "syndic" varchar,
        "regime_juridique" varchar,
        "notes" text,
        "archived" boolean DEFAULT false,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Locataires AM
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_locataires" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "prenom" varchar,
        "email" varchar,
        "telephone" varchar,
        "adresse" text,
        "siret" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Lots
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_lots" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actif_id" varchar NOT NULL,
        "sci_id" varchar,
        "designation" varchar NOT NULL,
        "type" varchar,
        "etage" varchar,
        "surface" numeric,
        "surface_carrez" numeric,
        "dpe" varchar,
        "loyer_mensuel" numeric,
        "loyer_annuel" numeric,
        "charges_lot" numeric,
        "statut" varchar DEFAULT 'vacant',
        "locataire_id" varchar,
        "notes" text,
        "archived" boolean DEFAULT false,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Baux AM
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_baux" (
        "id" varchar PRIMARY KEY NOT NULL,
        "lot_id" varchar,
        "actif_id" varchar,
        "sci_id" varchar,
        "locataire_id" varchar,
        "type_bail" varchar,
        "date_debut" varchar,
        "date_fin" varchar,
        "date_signature" varchar,
        "loyer_mensuel" numeric,
        "loyer_annuel" numeric,
        "charges" numeric,
        "depot_garantie" numeric,
        "indice_reference" varchar,
        "trimestre_ref" varchar,
        "valeur_indice_base" numeric,
        "statut" varchar DEFAULT 'actif',
        "loyer_theorique" numeric,
        "notes" text,
        "archived" boolean DEFAULT false,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Emprunts
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_emprunts" (
        "id" varchar PRIMARY KEY NOT NULL,
        "sci_id" varchar,
        "actif_id" varchar,
        "banque" varchar,
        "montant_emprunte" numeric,
        "capital_restant_du" numeric,
        "taux_annuel" numeric,
        "taeg" numeric,
        "duree_ans" integer,
        "duree_mois" integer,
        "date_debut" varchar,
        "date_fin" varchar,
        "type_amortissement" varchar,
        "mensualite" numeric,
        "assurance_mensuelle" numeric,
        "taux_assurance" numeric,
        "type_garantie" varchar,
        "ira" numeric,
        "notes" text,
        "archived" boolean DEFAULT false,
        "deleted_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Travaux
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_travaux" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actif_id" varchar,
        "sci_id" varchar,
        "titre" varchar NOT NULL,
        "description" text,
        "budget" numeric,
        "montant_reel" numeric,
        "date_debut" varchar,
        "date_fin" varchar,
        "statut" varchar DEFAULT 'planifié',
        "prestataire" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        "deleted_at" timestamp
      )
    `);

    // Participations
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_participations" (
        "id" varchar PRIMARY KEY NOT NULL,
        "associe_id" varchar NOT NULL,
        "sci_id" varchar NOT NULL,
        "parts_sociales" numeric,
        "pourcentage" numeric,
        "montant_apport" numeric,
        "date_entree" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Documents AM
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_documents" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actif_id" varchar,
        "sci_id" varchar,
        "name" varchar NOT NULL,
        "type" varchar NOT NULL,
        "category" varchar,
        "storage_url" text,
        "file_name" varchar,
        "file_size" integer,
        "mime_type" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Bailleurs
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_bailleurs" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "type" varchar,
        "email" varchar,
        "telephone" varchar,
        "adresse" text,
        "siret" varchar,
        "iban" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        "deleted_at" timestamp
      )
    `);

    // Gestionnaires
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_gestionnaires" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "bailleur_id" varchar,
        "email" varchar,
        "telephone" varchar,
        "adresse" text,
        "societe" varchar,
        "siret" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        "deleted_at" timestamp
      )
    `);

    // Locataires GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_locataires" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "prenom" varchar,
        "email" varchar,
        "telephone" varchar,
        "adresse" text,
        "siret" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        "deleted_at" timestamp
      )
    `);

    // Baux GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_baux" (
        "id" varchar PRIMARY KEY NOT NULL,
        "nom" varchar NOT NULL,
        "locataire_id" varchar,
        "bailleur_id" varchar,
        "gestionnaire_id" varchar,
        "type_bail" varchar,
        "adresse" text,
        "ville" varchar,
        "code_postal" varchar,
        "lat" real,
        "lng" real,
        "date_signature" varchar,
        "date_effet" varchar,
        "date_debut" timestamp,
        "date_fin" timestamp,
        "periode_ferme_debut" varchar,
        "periode_ferme_fin" varchar,
        "periode_ferme_duree_ans" integer,
        "ech_trien1" varchar,
        "ech_trien2" varchar,
        "ech_trien3" varchar,
        "loyer_base_ht" numeric,
        "loyer_ht_actu" numeric,
        "force_manual" boolean DEFAULT false,
        "indice_reference" varchar,
        "trimestre_ref" varchar,
        "date_indice_base" timestamp,
        "valeur_indice_base" numeric,
        "charges" numeric,
        "depot_garantie" numeric,
        "taxe_fonciere" numeric,
        "taxe" varchar,
        "tva_taux" numeric,
        "garantie_type" varchar,
        "garantie_montant" numeric,
        "surface" numeric,
        "surface_exterieure" numeric,
        "capacite" integer,
        "statut" varchar,
        "archived" boolean DEFAULT false,
        "deleted_at" timestamp,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Paiements GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_paiements" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "date" varchar NOT NULL,
        "montant" numeric NOT NULL,
        "type" varchar NOT NULL,
        "methode" varchar,
        "reference" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Factures GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_factures" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "type" varchar NOT NULL,
        "file_name" varchar NOT NULL,
        "file_url" text,
        "file_size" integer,
        "mime_type" varchar,
        "date_facture" varchar NOT NULL,
        "date_echeance" varchar,
        "montant_ht" numeric,
        "montant_ttc" numeric NOT NULL,
        "reference" varchar,
        "statut" varchar NOT NULL,
        "date_paiement" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Quittances GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_quittances" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "periode_debut" varchar NOT NULL,
        "periode_fin" varchar NOT NULL,
        "montant_loyer" numeric,
        "montant_charges" numeric,
        "montant_total" numeric,
        "date_emission" varchar,
        "statut" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Indexations GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_indexations" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "date_application" varchar NOT NULL,
        "ancien_loyer" numeric,
        "nouveau_loyer" numeric,
        "indice_base" numeric,
        "indice_nouveau" numeric,
        "type_indice" varchar,
        "taux_variation" numeric,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Indices
    await client.query(`
      CREATE TABLE IF NOT EXISTS "indices" (
        "id" varchar PRIMARY KEY NOT NULL,
        "type" varchar NOT NULL,
        "trimestre" varchar NOT NULL,
        "valeur" numeric NOT NULL,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Avenants GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_avenants" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "date_effet" varchar NOT NULL,
        "date_signature" varchar,
        "champs_modifies" text NOT NULL,
        "titre" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Renouvellements GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_renouvellements" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "date_effet" varchar NOT NULL,
        "date_signature" varchar,
        "nouvelle_date_fin" varchar NOT NULL,
        "champs_modifies" text NOT NULL,
        "titre" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Documents GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_documents" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar,
        "name" varchar NOT NULL,
        "type" varchar NOT NULL,
        "category" varchar,
        "storage_url" text,
        "file_name" varchar,
        "file_size" integer,
        "mime_type" varchar,
        "date_document" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Alertes
    await client.query(`
      CREATE TABLE IF NOT EXISTS "alertes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "module" varchar NOT NULL,
        "entity_type" varchar,
        "entity_id" varchar,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "message" text,
        "target_date" varchar,
        "priority" varchar DEFAULT 'normal',
        "dismissed" boolean DEFAULT false,
        "dismissed_at" timestamp,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Historique
    await client.query(`
      CREATE TABLE IF NOT EXISTS "historique" (
        "id" varchar PRIMARY KEY NOT NULL,
        "module" varchar NOT NULL,
        "type" varchar NOT NULL,
        "entity" varchar NOT NULL,
        "entity_id" varchar NOT NULL,
        "details" text,
        "user_id" varchar,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Ref Taux Emprunt (données de marché)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ref_taux_emprunt" (
        "id" varchar PRIMARY KEY NOT NULL,
        "source" varchar NOT NULL,
        "type_actif" varchar NOT NULL,
        "duree_ans" integer NOT NULL,
        "taux" numeric NOT NULL,
        "periode" varchar,
        "date_releve" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Ref Valeurs Vénales (prix/m² marché)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ref_valeurs_venales" (
        "id" varchar PRIMARY KEY NOT NULL,
        "source" varchar NOT NULL,
        "code_postal" varchar NOT NULL,
        "ville" varchar,
        "code_insee" varchar,
        "type_bien" varchar NOT NULL,
        "prix_m2_median" numeric,
        "prix_m2_bas" numeric,
        "prix_m2_haut" numeric,
        "nb_transactions" integer,
        "periode" varchar,
        "date_releve" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Ref Valeurs Locatives (loyer/m² marché)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ref_valeurs_locatives" (
        "id" varchar PRIMARY KEY NOT NULL,
        "source" varchar NOT NULL,
        "code_postal" varchar NOT NULL,
        "ville" varchar,
        "code_insee" varchar,
        "type_bien" varchar NOT NULL,
        "loyer_m2_mensuel_median" numeric,
        "loyer_m2_mensuel_bas" numeric,
        "loyer_m2_mensuel_haut" numeric,
        "periode" varchar,
        "date_releve" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Ref Taux de Capitalisation (dérivé ou manuel)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ref_taux_capitalisation" (
        "id" varchar PRIMARY KEY NOT NULL,
        "source" varchar NOT NULL,
        "code_postal" varchar NOT NULL,
        "ville" varchar,
        "code_insee" varchar,
        "type_bien" varchar NOT NULL,
        "taux_capi" numeric NOT NULL,
        "taux_capi_bas" numeric,
        "taux_capi_haut" numeric,
        "fiabilite" varchar,
        "methode_calcul" varchar,
        "periode" varchar,
        "date_releve" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Ref Marché Scraping (données Phase 2 scrapées)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ref_marche_scraping" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actif_id" varchar REFERENCES "am_actifs"("id") ON DELETE cascade,
        "source" varchar NOT NULL,
        "type_recherche" varchar NOT NULL,
        "type_bien" varchar NOT NULL,
        "prix_m2_median" numeric,
        "prix_m2_bas" numeric,
        "prix_m2_haut" numeric,
        "loyer_m2_mensuel_median" numeric,
        "loyer_m2_mensuel_bas" numeric,
        "loyer_m2_mensuel_haut" numeric,
        "nb_annonces" integer,
        "rayon_km" numeric,
        "lat" real,
        "lng" real,
        "code_postal" varchar,
        "ville" varchar,
        "taux_capi_deduit" numeric,
        "date_releve" varchar,
        "raw_data" jsonb,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Études IA
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_etudes_ia" (
        "id" varchar PRIMARY KEY NOT NULL,
        "actif_id" varchar NOT NULL REFERENCES "am_actifs"("id") ON DELETE cascade,
        "phase1_data" jsonb,
        "positionnement" jsonb,
        "potentiel" jsonb,
        "risques" jsonb,
        "recommandations" jsonb,
        "comparables" jsonb,
        "synthese" text,
        "confidence" varchar,
        "model" varchar,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // ─── Indexes on foreign keys ───
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "idx_actifs_sci_id" ON "am_actifs" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_actif_id" ON "am_lots" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_sci_id" ON "am_lots" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_locataire_id" ON "am_lots" ("locataire_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_am_lot_id" ON "am_baux" ("lot_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_am_actif_id" ON "am_baux" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_am_sci_id" ON "am_baux" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_am_locataire_id" ON "am_baux" ("locataire_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_emprunts_sci_id" ON "am_emprunts" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_emprunts_actif_id" ON "am_emprunts" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_travaux_actif_id" ON "am_travaux" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_travaux_sci_id" ON "am_travaux" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_participations_associe_id" ON "am_participations" ("associe_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_participations_sci_id" ON "am_participations" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_gestionnaires_bailleur_id" ON "gl_gestionnaires" ("bailleur_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_locataire_id" ON "gl_baux" ("locataire_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_bailleur_id" ON "gl_baux" ("bailleur_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_gestionnaire_id" ON "gl_baux" ("gestionnaire_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_paiements_gl_bail_id" ON "gl_paiements" ("bail_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_factures_gl_bail_id" ON "gl_factures" ("bail_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_quittances_gl_bail_id" ON "gl_quittances" ("bail_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_indexations_gl_bail_id" ON "gl_indexations" ("bail_id")`,
    ];
    for (const idx of indexes) {
      await client.query(idx);
    }

    // Foreign keys (use DO blocks to skip if already exist)
    const fks = [
      `ALTER TABLE "am_actifs" ADD CONSTRAINT "am_actifs_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_avenants" ADD CONSTRAINT "gl_avenants_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_baux" ADD CONSTRAINT "am_baux_lot_id_am_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "am_lots"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_baux" ADD CONSTRAINT "am_baux_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_baux" ADD CONSTRAINT "am_baux_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_baux" ADD CONSTRAINT "am_baux_locataire_id_am_locataires_id_fk" FOREIGN KEY ("locataire_id") REFERENCES "am_locataires"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_locataire_id_gl_locataires_id_fk" FOREIGN KEY ("locataire_id") REFERENCES "gl_locataires"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_bailleur_id_gl_bailleurs_id_fk" FOREIGN KEY ("bailleur_id") REFERENCES "gl_bailleurs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_gestionnaire_id_gl_gestionnaires_id_fk" FOREIGN KEY ("gestionnaire_id") REFERENCES "gl_gestionnaires"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_documents" ADD CONSTRAINT "am_documents_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_documents" ADD CONSTRAINT "am_documents_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_documents" ADD CONSTRAINT "gl_documents_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_emprunts" ADD CONSTRAINT "am_emprunts_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_emprunts" ADD CONSTRAINT "am_emprunts_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_factures" ADD CONSTRAINT "gl_factures_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "gl_gestionnaires" ADD CONSTRAINT "gl_gestionnaires_bailleur_id_gl_bailleurs_id_fk" FOREIGN KEY ("bailleur_id") REFERENCES "gl_bailleurs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_indexations" ADD CONSTRAINT "gl_indexations_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_lots" ADD CONSTRAINT "am_lots_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_lots" ADD CONSTRAINT "am_lots_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "am_lots" ADD CONSTRAINT "am_lots_locataire_id_am_locataires_id_fk" FOREIGN KEY ("locataire_id") REFERENCES "am_locataires"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_paiements" ADD CONSTRAINT "gl_paiements_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_participations" ADD CONSTRAINT "am_participations_associe_id_am_associes_id_fk" FOREIGN KEY ("associe_id") REFERENCES "am_associes"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_participations" ADD CONSTRAINT "am_participations_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "gl_quittances" ADD CONSTRAINT "gl_quittances_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "gl_renouvellements" ADD CONSTRAINT "gl_renouvellements_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_travaux" ADD CONSTRAINT "am_travaux_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_travaux" ADD CONSTRAINT "am_travaux_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
    ];

    for (const fk of fks) {
      // Wrap in DO block so PostgreSQL handles "already exists" internally
      // without aborting the transaction (error 25P02)
      const safe = `DO $$ BEGIN ${fk}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
      await client.query(safe);
    }

    // ─── CHECK constraints (M4.2) ───
    const checks = [
      `ALTER TABLE "am_participations" ADD CONSTRAINT "chk_participation_pct" CHECK ("pourcentage" IS NULL OR ("pourcentage"::numeric >= 0 AND "pourcentage"::numeric <= 100))`,
      `ALTER TABLE "am_emprunts" ADD CONSTRAINT "chk_emprunt_taux" CHECK ("taux_annuel" IS NULL OR "taux_annuel"::numeric >= 0)`,
      `ALTER TABLE "am_emprunts" ADD CONSTRAINT "chk_emprunt_duree" CHECK ("duree_ans" IS NULL OR "duree_ans" > 0)`,
      `ALTER TABLE "am_emprunts" ADD CONSTRAINT "chk_emprunt_montant" CHECK ("montant_emprunte" IS NULL OR "montant_emprunte"::numeric >= 0)`,
    ];
    for (const ck of checks) {
      const safe = `DO $$ BEGIN ${ck}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
      await client.query(safe);
    }

    // ─── UNIQUE constraints on business keys (M4.4) ───
    const uniques = [
      `ALTER TABLE "indices" ADD CONSTRAINT "uq_indices_type_trimestre" UNIQUE ("type", "trimestre")`,
      `ALTER TABLE "ref_valeurs_venales" ADD CONSTRAINT "uq_ref_vv_source_cp_type_periode" UNIQUE ("source", "code_postal", "type_bien", "periode")`,
      `ALTER TABLE "ref_valeurs_locatives" ADD CONSTRAINT "uq_ref_vl_source_cp_type_periode" UNIQUE ("source", "code_postal", "type_bien", "periode")`,
    ];
    for (const uq of uniques) {
      const safe = `DO $$ BEGIN ${uq}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
      await client.query(safe);
    }

    // Safe ADD COLUMN for soft-delete on tables that may already exist
    const softDeleteTables = ["am_travaux", "gl_bailleurs", "gl_gestionnaires", "gl_locataires"];
    for (const tbl of softDeleteTables) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "${tbl}" ADD COLUMN "deleted_at" timestamp;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    await client.query("COMMIT");
    logger.info("database schema ensured");
  } catch (error: any) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore rollback error */ }
    logger.error("ensure-schema error detail: " + String(error) + " | code=" + (error?.code ?? "none"));
    throw error;
  } finally {
    client.release();
  }
}
