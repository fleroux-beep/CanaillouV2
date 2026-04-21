import { pool } from "./db";
import { logger } from "./lib/logger";

/**
 * Migration 0001 — runs in its OWN small transactions BEFORE the big
 * ensureSchema transaction below.
 *
 * Why a separate function? The main ensureSchema() runs ~50 statements in
 * a single transaction. If any one of them throws (FK conflict, check
 * constraint, date migration on a row that won't cast, etc.) the whole
 * thing is rolled back — including the ADD COLUMN we depend on. Worse,
 * server/index.ts swallows ensureSchema errors so the server keeps
 * running on the half-migrated DB and every query for `scope='am'`
 * crashes with `column "scope" does not exist`.
 *
 * Putting the column additions in their own auto-committed statements
 * guarantees that, no matter what happens later in ensureSchema, the
 * unification columns are always present at runtime.
 */
async function applyBauxUnificationMigration() {
  const client = await pool.connect();
  try {
    // Skip cleanly if gl_baux doesn't exist yet — the main ensureSchema()
    // run will create it from scratch with all the new columns.
    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'gl_baux'`,
    );
    if (tableCheck.rowCount === 0) return;

    const glBauxNewCols: [string, string][] = [
      ["scope", "varchar NOT NULL DEFAULT 'gl'"],
      ["lot_id", "varchar"],
      ["actif_id", "varchar"],
      ["sci_id", "varchar"],
      ["loyer_mensuel", "numeric"],
      ["loyer_annuel", "numeric"],
      ["loyer_theorique", "numeric"],
    ];
    for (const [col, type] of glBauxNewCols) {
      try {
        await client.query(
          `ALTER TABLE "gl_baux" ADD COLUMN IF NOT EXISTS "${col}" ${type}`,
        );
      } catch (err: any) {
        // Postgres < 9.6 doesn't support IF NOT EXISTS on ADD COLUMN; fall
        // back to a DO block that catches duplicate_column.
        await client.query(`
          DO $$ BEGIN
            ALTER TABLE "gl_baux" ADD COLUMN "${col}" ${type};
          EXCEPTION WHEN duplicate_column THEN NULL;
          END $$;
        `);
      }
    }

    // gl_baux.nom becomes NULL-able so the migration copy from am_baux can
    // derive a fallback name without violating the old NOT NULL constraint.
    try {
      await client.query(`ALTER TABLE "gl_baux" ALTER COLUMN "nom" DROP NOT NULL`);
    } catch (_) {
      /* already nullable */
    }

    // Drop the legacy FK am_lots → am_locataires (any name) so a later
    // ensureSchema() pass can re-add it pointing at gl_locataires without
    // a duplicate-target conflict.
    try {
      await client.query(`
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_class rt ON rt.oid = c.confrelid
            WHERE t.relname = 'am_lots'
              AND rt.relname = 'am_locataires'
              AND c.contype = 'f'
          LOOP
            EXECUTE format('ALTER TABLE "am_lots" DROP CONSTRAINT %I', r.conname);
          END LOOP;
        END $$;
      `);
    } catch (_) {
      /* table may not exist — fine */
    }

    // Backfill gl_locataires from am_locataires if the legacy table still
    // exists. UUIDs are preserved so existing FKs keep resolving. This is
    // idempotent: ON CONFLICT DO NOTHING skips already-migrated rows.
    try {
      const amLocCheck = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'am_locataires'`,
      );
      if ((amLocCheck.rowCount ?? 0) > 0) {
        await client.query(`
          INSERT INTO "gl_locataires" (id, owner_id, nom, prenom, email, telephone, adresse, siret, notes, created_at, updated_at)
          SELECT id, owner_id, nom, prenom, email, telephone, adresse, siret, notes, created_at, updated_at
          FROM "am_locataires"
          ON CONFLICT (id) DO NOTHING;
        `);
        logger.info("migration 0001: am_locataires backfilled into gl_locataires");
      }
    } catch (err: any) {
      logger.warn("migration 0001: am_locataires backfill skipped", { error: err.message });
    }

    // Backfill gl_baux from am_baux (scope='am') if the legacy table still
    // exists. Auto-detects indiceReference from typeBail per French law.
    try {
      const amBauxCheck = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'am_baux'`,
      );
      if ((amBauxCheck.rowCount ?? 0) > 0) {
        await client.query(`
          INSERT INTO "gl_baux" (
            id, scope, nom, lot_id, actif_id, sci_id, locataire_id, type_bail,
            date_debut, date_fin,
            loyer_mensuel, loyer_annuel, loyer_theorique, loyer_base_ht, loyer_ht_actu,
            charges, depot_garantie,
            indice_reference, trimestre_ref, valeur_indice_base,
            statut, notes, archived, deleted_at, created_at, updated_at
          )
          SELECT
            b.id,
            'am' AS scope,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' — ', a.nom, l.designation)), ''),
              CONCAT('Bail ', LEFT(b.id::text, 8))
            ) AS nom,
            b.lot_id, b.actif_id, b.sci_id, b.locataire_id, b.type_bail,
            b.date_debut::timestamp, b.date_fin::timestamp,
            b.loyer_mensuel, b.loyer_annuel, b.loyer_theorique,
            b.loyer_annuel AS loyer_base_ht,
            b.loyer_annuel AS loyer_ht_actu,
            b.charges, b.depot_garantie,
            COALESCE(
              b.indice_reference,
              CASE
                WHEN LOWER(COALESCE(b.type_bail, '')) SIMILAR TO '%(habitation|logement|residentiel|résidentiel)%' THEN 'IRL'
                WHEN LOWER(COALESCE(b.type_bail, '')) SIMILAR TO '%(tertiaire|bureau|professionnel)%' THEN 'ILAT'
                WHEN LOWER(COALESCE(b.type_bail, '')) SIMILAR TO '%(commercial|boutique|creche|crèche|commerce|derogatoire|dérogatoire)%' THEN 'ILC'
                WHEN LOWER(COALESCE(b.type_bail, '')) SIMILAR TO '%(construction|chantier)%' THEN 'ICC'
                ELSE NULL
              END
            ) AS indice_reference,
            b.trimestre_ref, b.valeur_indice_base,
            b.statut, b.notes, COALESCE(b.archived, false), b.deleted_at, b.created_at, b.updated_at
          FROM "am_baux" b
          LEFT JOIN "am_actifs" a ON a.id = b.actif_id
          LEFT JOIN "am_lots" l ON l.id = b.lot_id
          ON CONFLICT (id) DO NOTHING;
        `);
        logger.info("migration 0001: am_baux backfilled into gl_baux with scope='am'");
        await client.query(`DROP TABLE IF EXISTS "am_baux" CASCADE`);
        logger.info("migration 0001: am_baux table dropped (data now in gl_baux)");
      }
    } catch (err: any) {
      logger.warn("migration 0001: am_baux backfill skipped", { error: err.message });
    }

    // Ensure every gl_baux row has a non-null nom, then enforce NOT NULL to
    // match schema.ts (migration 0001 audit fix: eliminate drift).
    try {
      await client.query(`
        UPDATE "gl_baux"
        SET "nom" = CONCAT('Bail ', LEFT(id::text, 8))
        WHERE "nom" IS NULL OR "nom" = '';
      `);
      await client.query(`ALTER TABLE "gl_baux" ALTER COLUMN "nom" SET NOT NULL`);
    } catch (_) {
      /* table may not have nom column on a very old schema — fine */
    }

    logger.info("migration 0001: gl_baux unification columns ensured");
  } catch (err: any) {
    logger.error("migration 0001 failed", { error: err.message, code: err.code });
    // We do not rethrow — any failure here should not block the main
    // ensureSchema() from running. The runtime errors will surface what
    // is actually missing.
  } finally {
    client.release();
  }
}

/**
 * Migration 0002 — Loyer unification.
 *
 * Single source of truth for rent: bauxGL.loyerBaseHT (signature) +
 * bauxGL.loyerHTActu (indexed). The legacy columns
 * `loyer_mensuel`, `loyer_annuel`, `loyer_theorique` on gl_baux and
 * `loyer_mensuel`, `loyer_annuel` on am_lots are backfilled and dropped.
 *
 * Runs in its own auto-committed statements outside the main transaction
 * so the CREATE TABLE statements below never see a half-dropped column.
 *
 * IMPORTANT — la version précédente de cette migration utilisait `IS NULL`
 * comme garde, ce qui laissait `loyer_ht_actu` figé sur le snapshot pris
 * par la migration 0001. Or l'ancien formulaire AM Baux écrivait
 * exclusivement dans `loyer_annuel` (jamais dans `loyer_ht_actu`), donc
 * tous les loyers édités après la migration 0001 ont été perdus à la
 * première exécution de cette migration. Cette version écrase
 * inconditionnellement `loyer_base_ht` et `loyer_ht_actu` à partir de
 * `loyer_annuel` quand celle-ci est non-null, pour que la valeur saisie
 * par l'utilisateur (canonique) soit préservée. L'indexation INSEE
 * recalculera ensuite `loyer_ht_actu` au prochain run.
 */
async function applyLoyerCleanupMigration() {
  const client = await pool.connect();
  try {
    // 1. gl_baux backfill — la valeur saisie par l'utilisateur dans
    // l'ancien formulaire vit dans `loyer_annuel`. C'est la source de
    // vérité ; on la copie inconditionnellement vers loyer_base_ht et
    // loyer_ht_actu, en prenant le MAX pour ne pas écraser une éventuelle
    // valeur indexée plus haute par le job INSEE.
    let loyerAnnuelExists = false;
    try {
      const check = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'gl_baux' AND column_name = 'loyer_annuel'
      `);
      loyerAnnuelExists = (check.rowCount ?? 0) > 0;
    } catch { /* ignore */ }

    if (loyerAnnuelExists) {
      try {
        // 1a. Refresh loyer_base_ht from loyer_annuel (canonique).
        await client.query(`
          UPDATE "gl_baux"
          SET "loyer_base_ht" = "loyer_annuel"
          WHERE "loyer_annuel" IS NOT NULL
            AND ("loyer_base_ht" IS NULL OR "loyer_base_ht" <> "loyer_annuel");
        `);
        // 1b. Refresh loyer_ht_actu : on prend le MAX(actu, annuel) pour
        // préserver une éventuelle indexation déjà appliquée tout en
        // récupérant les éditions manuelles plus récentes.
        await client.query(`
          UPDATE "gl_baux"
          SET "loyer_ht_actu" = GREATEST(
            COALESCE("loyer_ht_actu", 0),
            COALESCE("loyer_annuel", 0)
          )
          WHERE "loyer_annuel" IS NOT NULL;
        `);
        // 1c. Si seul loyer_mensuel est renseigné (rare), le multiplier par 12.
        await client.query(`
          UPDATE "gl_baux"
          SET "loyer_base_ht" = "loyer_mensuel" * 12,
              "loyer_ht_actu" = GREATEST(
                COALESCE("loyer_ht_actu", 0),
                "loyer_mensuel" * 12
              )
          WHERE "loyer_annuel" IS NULL
            AND "loyer_mensuel" IS NOT NULL
            AND "loyer_base_ht" IS NULL;
        `);
        logger.info("migration 0002: gl_baux loyer values refreshed from loyer_annuel");
      } catch (err: any) {
        logger.warn("migration 0002: gl_baux backfill failed", { error: err.message });
      }
    } else {
      // Colonne déjà droppée — fallback : s'assurer que loyer_ht_actu
      // n'est jamais NULL quand loyer_base_ht est défini.
      try {
        await client.query(`
          UPDATE "gl_baux"
          SET "loyer_ht_actu" = "loyer_base_ht"
          WHERE "loyer_ht_actu" IS NULL AND "loyer_base_ht" IS NOT NULL;
        `);
      } catch (err: any) {
        logger.warn("migration 0002: gl_baux loyer_ht_actu fallback skipped", { error: err.message });
      }
    }

    // 2. am_lots backfill — the lot no longer carries a rent. If an am_lots
    // row has a loyer but no matching gl_baux row, create one so the value
    // isn't silently dropped. L'ancien getLoyerAnnuelActif fallbackait sur
    // les lots `loué` quand l'actif n'avait aucun bail, donc on doit
    // recréer un bail pour chacun de ces lots avant de laisser tomber la
    // colonne.
    let lotsLoyerExists = false;
    try {
      const check = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'am_lots' AND column_name = 'loyer_annuel'
      `);
      lotsLoyerExists = (check.rowCount ?? 0) > 0;
    } catch { /* ignore */ }

    if (lotsLoyerExists) {
      try {
        await client.query(`
          INSERT INTO "gl_baux" (
            id, scope, nom, lot_id, actif_id, sci_id, locataire_id, type_bail,
            loyer_base_ht, loyer_ht_actu, statut, created_at, updated_at
          )
          SELECT
            gen_random_uuid()::text,
            'am',
            CONCAT('Bail (migré) — ', COALESCE(l.designation, l.id)),
            l.id, l.actif_id, l.sci_id, l.locataire_id,
            NULL,
            COALESCE(l.loyer_annuel, l.loyer_mensuel * 12),
            COALESCE(l.loyer_annuel, l.loyer_mensuel * 12),
            'actif', now(), now()
          FROM "am_lots" l
          WHERE (l.loyer_annuel IS NOT NULL OR l.loyer_mensuel IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1 FROM "gl_baux" b
              WHERE b.lot_id = l.id AND b.scope = 'am'
            );
        `);
        logger.info("migration 0002: am_lots loyers backfilled into gl_baux");
      } catch (err: any) {
        logger.warn("migration 0002: am_lots backfill failed", { error: err.message });
      }
    }

    // 3. Drop legacy columns. `DROP COLUMN IF EXISTS` is idempotent.
    const drops: [string, string][] = [
      ["gl_baux", "loyer_mensuel"],
      ["gl_baux", "loyer_annuel"],
      ["gl_baux", "loyer_theorique"],
      ["am_lots", "loyer_mensuel"],
      ["am_lots", "loyer_annuel"],
    ];
    for (const [table, col] of drops) {
      try {
        await client.query(
          `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${col}"`,
        );
      } catch (err: any) {
        logger.warn(`migration 0002: drop ${table}.${col} failed`, { error: err.message });
      }
    }

    logger.info("migration 0002: loyer columns unified on gl_baux only");
  } catch (err: any) {
    logger.error("migration 0002 failed", { error: err.message, code: err.code });
    // Do not rethrow — any failure here should not block the main ensureSchema.
  } finally {
    client.release();
  }
}

/**
 * Migration 0003 — modèle loyer durable (base + auto-INSEE + override manuel).
 *
 * Ajoute `gl_baux.loyer_manuel_override` (numeric, nullable) et force la
 * colonne `force_manual` à NOT NULL DEFAULT false. Crée également la table
 * `gl_baux_franchises` pour modéliser séparément les franchises / prorata.
 *
 * Idempotente : peut être rejouée sans effet de bord. Runs in its own
 * committed transactions so it survives a rollback of the big ensureSchema
 * transaction.
 */
async function applyLoyerManuelOverrideMigration() {
  const client = await pool.connect();
  try {
    // 1. Skip cleanly if gl_baux doesn't exist — ensureSchema() crée la table
    // avec les bonnes colonnes en une passe.
    const tableCheck = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'gl_baux'`,
    );
    if (tableCheck.rowCount === 0) return;

    // 2. Ajout loyer_manuel_override (nullable)
    try {
      await client.query(
        `ALTER TABLE "gl_baux" ADD COLUMN IF NOT EXISTS "loyer_manuel_override" numeric`,
      );
    } catch (err: any) {
      // Fallback Postgres < 9.6
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "gl_baux" ADD COLUMN "loyer_manuel_override" numeric;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    // 3. Durcir force_manual : NOT NULL DEFAULT false. On backfill les NULL
    // existants à false avant d'appliquer la contrainte.
    try {
      await client.query(
        `UPDATE "gl_baux" SET "force_manual" = false WHERE "force_manual" IS NULL`,
      );
      await client.query(
        `ALTER TABLE "gl_baux" ALTER COLUMN "force_manual" SET DEFAULT false`,
      );
      await client.query(
        `ALTER TABLE "gl_baux" ALTER COLUMN "force_manual" SET NOT NULL`,
      );
    } catch (err: any) {
      logger.warn("migration 0003: force_manual NOT NULL failed", { error: err.message });
    }

    // 4. Table franchises (CREATE IF NOT EXISTS, idempotent)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "gl_baux_franchises" (
          "id" varchar PRIMARY KEY NOT NULL,
          "bail_id" varchar NOT NULL REFERENCES "gl_baux"("id") ON DELETE CASCADE,
          "date_debut" date NOT NULL,
          "date_fin" date NOT NULL,
          "montant" numeric NOT NULL,
          "motif" varchar,
          "notes" text,
          "created_at" timestamp DEFAULT now()
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_franchises_baux_bail_id" ON "gl_baux_franchises"("bail_id")`,
      );
    } catch (err: any) {
      logger.warn("migration 0003: gl_baux_franchises create failed", { error: err.message });
    }

    logger.info("migration 0003: loyer manuel override + franchises table ready");
  } catch (err: any) {
    logger.error("migration 0003 failed", { error: err.message, code: err.code });
    // Do not rethrow — any failure here should not block the main ensureSchema.
  } finally {
    client.release();
  }
}

/**
 * Ensures all database tables exist by running CREATE TABLE IF NOT EXISTS.
 * This replaces drizzle-kit push / drizzle-orm migrate which don't work
 * when the server is bundled with esbuild (fs-based migration files are unavailable).
 */
export async function ensureSchema() {
  // Step 0: critical column additions in their own committed transactions so
  // they survive any rollback of the big transaction below.
  await applyBauxUnificationMigration();
  // Step 0b: drop the legacy rent columns now that everything reads from
  // loyerBaseHT / loyerHTActu. Runs AFTER applyBauxUnificationMigration so
  // the backfill INSERT (which still references loyer_annuel) can run first.
  await applyLoyerCleanupMigration();
  // Step 0c: modèle loyer durable (override manuel + franchises).
  await applyLoyerManuelOverrideMigration();

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
        "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade,
        "nom" varchar NOT NULL,
        "forme_juridique" varchar,
        "capital" numeric,
        "regime_fiscal" varchar,
        "siret" varchar,
        "adresse" text,
        "ville" varchar,
        "code_postal" varchar,
        "date_creation" date,
        "gerant" varchar,
        "expert_comptable" varchar,
        "banque" varchar,
        "iban" varchar,
        "date_revente" date,
        "taux_rendement" numeric,
        "dividendes_realises" numeric,
        "date_cloture_exercice" date,
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
        "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade,
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
        "date_acquisition" date,
        "charges_annuelles" numeric,
        "taxe_fonciere" numeric,
        "assurance_pno" numeric,
        "charges_copropriete" numeric,
        "taux_capitalisation" numeric,
        "prix_m2_marche" numeric,
        "valeur_estimee_sortie" numeric,
        "date_estimation" date,
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

    // Locataires AM — unified with gl_locataires (dropped in migration 0001)

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

    // Baux AM — unified with gl_baux (dropped in migration 0001). The AM-specific
    // columns (lot_id, actif_id, sci_id, loyer_mensuel, loyer_annuel, loyer_theorique)
    // now live on gl_baux, keyed by `scope = 'am'`.

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
        "date_debut" date,
        "date_fin" date,
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
        "date_debut" date,
        "date_fin" date,
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
        "date_entree" date,
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
        "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade,
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
        "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade,
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

    // Baux GL (unified — post-migration 0001). Shared storage for both UIs.
    // `scope` partitions rows ('am' vs 'gl'). `nom` is nullable at creation
    // time because AM baux don't always carry an explicit name, but the
    // migration forces a fallback so no row is ever left without one.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_baux" (
        "id" varchar PRIMARY KEY NOT NULL,
        "scope" varchar NOT NULL DEFAULT 'gl',
        "nom" varchar NOT NULL,
        "lot_id" varchar,
        "actif_id" varchar,
        "sci_id" varchar,
        "locataire_id" varchar,
        "bailleur_id" varchar,
        "gestionnaire_id" varchar,
        "type_bail" varchar,
        "adresse" text,
        "ville" varchar,
        "code_postal" varchar,
        "lat" real,
        "lng" real,
        "date_signature" date,
        "date_effet" date,
        "date_debut" timestamp,
        "date_fin" timestamp,
        "periode_ferme_debut" date,
        "periode_ferme_fin" date,
        "periode_ferme_duree_ans" integer,
        "ech_trien1" date,
        "ech_trien2" date,
        "ech_trien3" date,
        "loyer_base_ht" numeric,
        "loyer_ht_actu" numeric,
        "force_manual" boolean NOT NULL DEFAULT false,
        "loyer_manuel_override" numeric,
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

    // Franchises de loyer (rent-free + prorata temporels)
    // FK + CHECK inline : migration 0003 peut avoir déjà créé la table avec la
    // FK ; cette CREATE IF NOT EXISTS est un no-op dans ce cas. Pour les bases
    // vierges, c'est cette passe-ci qui pose la FK dès la création.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_baux_franchises" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL REFERENCES "gl_baux"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "date_debut" date NOT NULL,
        "date_fin" date NOT NULL,
        "montant" numeric NOT NULL CHECK ("montant" >= 0),
        "motif" varchar,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Paiements GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_paiements" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "date" date NOT NULL,
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
        "date_facture" date NOT NULL,
        "date_echeance" date,
        "montant_ht" numeric,
        "montant_ttc" numeric NOT NULL,
        "reference" varchar,
        "statut" varchar NOT NULL,
        "date_paiement" date,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Quittances GL
    await client.query(`
      CREATE TABLE IF NOT EXISTS "gl_quittances" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL,
        "periode_debut" date NOT NULL,
        "periode_fin" date NOT NULL,
        "montant_loyer" numeric,
        "montant_charges" numeric,
        "montant_total" numeric,
        "date_emission" date,
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
        "date_application" date NOT NULL,
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
        "date_effet" date NOT NULL,
        "date_signature" date,
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
        "date_effet" date NOT NULL,
        "date_signature" date,
        "nouvelle_date_fin" date NOT NULL,
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
        "date_document" date,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);

    // Alertes
    await client.query(`
      CREATE TABLE IF NOT EXISTS "alertes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade,
        "module" varchar NOT NULL,
        "entity_type" varchar,
        "entity_id" varchar,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "message" text,
        "target_date" date,
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
        "date_releve" date,
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
        "date_releve" date,
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
        "date_releve" date,
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
        "date_releve" date,
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
        "date_releve" date,
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

    // Migration 0001 (gl_baux unification columns + data backfill) is now
    // handled by applyBauxUnificationMigration() above, in its own transaction
    // so it survives any rollback of the main transaction below.

    // ─── Indexes on foreign keys ───
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "idx_actifs_sci_id" ON "am_actifs" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_actif_id" ON "am_lots" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_sci_id" ON "am_lots" ("sci_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_lots_locataire_id" ON "am_lots" ("locataire_id")`,
      // Post-unification indexes (covered by idx_baux_gl_* below).
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_scope" ON "gl_baux" ("scope")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_lot_id" ON "gl_baux" ("lot_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_actif_id" ON "gl_baux" ("actif_id")`,
      `CREATE INDEX IF NOT EXISTS "idx_baux_gl_sci_id" ON "gl_baux" ("sci_id")`,
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
      `CREATE INDEX IF NOT EXISTS "idx_franchises_baux_bail_id" ON "gl_baux_franchises" ("bail_id")`,
    ];
    for (const idx of indexes) {
      await client.query(idx);
    }

    // Foreign keys (use DO blocks to skip if already exist)
    const fks = [
      `ALTER TABLE "am_actifs" ADD CONSTRAINT "am_actifs_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_avenants" ADD CONSTRAINT "gl_avenants_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      // Post-unification: gl_baux now references am_* tables via its AM scope columns.
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_lot_id_am_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "am_lots"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
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
      `ALTER TABLE "am_lots" ADD CONSTRAINT "am_lots_locataire_id_gl_locataires_id_fk" FOREIGN KEY ("locataire_id") REFERENCES "gl_locataires"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_paiements" ADD CONSTRAINT "gl_paiements_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_participations" ADD CONSTRAINT "am_participations_associe_id_am_associes_id_fk" FOREIGN KEY ("associe_id") REFERENCES "am_associes"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_participations" ADD CONSTRAINT "am_participations_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "gl_quittances" ADD CONSTRAINT "gl_quittances_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "gl_renouvellements" ADD CONSTRAINT "gl_renouvellements_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_travaux" ADD CONSTRAINT "am_travaux_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "am_actifs"("id") ON DELETE cascade ON UPDATE cascade`,
      `ALTER TABLE "am_travaux" ADD CONSTRAINT "am_travaux_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "am_scis"("id") ON DELETE set null ON UPDATE cascade`,
      `ALTER TABLE "gl_baux_franchises" ADD CONSTRAINT "gl_baux_franchises_bail_id_gl_baux_id_fk" FOREIGN KEY ("bail_id") REFERENCES "gl_baux"("id") ON DELETE cascade ON UPDATE cascade`,
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
      `ALTER TABLE "gl_baux_franchises" ADD CONSTRAINT "chk_franchise_montant" CHECK ("montant" IS NULL OR "montant"::numeric >= 0)`,
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

    // Add owner_id to root entity tables for multi-tenant isolation (C2.2)
    const ownerTables = ["am_scis", "am_associes", "gl_bailleurs", "gl_locataires", "alertes"];
    for (const tbl of ownerTables) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "${tbl}" ADD COLUMN "owner_id" varchar REFERENCES "users"("id") ON DELETE cascade;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${tbl.replace("gl_", "").replace("am_", "")}_owner_id" ON "${tbl}" ("owner_id")`);
    }

    // Migrate varchar date columns to proper date type (C3.1)
    const dateColumnMigrations: [string, string][] = [
      ["am_scis", "date_creation"], ["am_scis", "date_revente"], ["am_scis", "date_cloture_exercice"],
      ["am_participations", "date_entree"],
      ["am_actifs", "date_acquisition"], ["am_actifs", "date_estimation"],
      // am_baux dropped in migration 0001 — date columns live on gl_baux now.
      ["am_emprunts", "date_debut"], ["am_emprunts", "date_fin"],
      ["am_travaux", "date_debut"], ["am_travaux", "date_fin"],
      ["gl_baux", "date_signature"], ["gl_baux", "date_effet"],
      ["gl_baux", "periode_ferme_debut"], ["gl_baux", "periode_ferme_fin"],
      ["gl_baux", "ech_trien1"], ["gl_baux", "ech_trien2"], ["gl_baux", "ech_trien3"],
      ["gl_paiements", "date"],
      ["gl_factures", "date_facture"], ["gl_factures", "date_echeance"], ["gl_factures", "date_paiement"],
      ["gl_quittances", "periode_debut"], ["gl_quittances", "periode_fin"], ["gl_quittances", "date_emission"],
      ["gl_indexations", "date_application"],
      ["gl_avenants", "date_effet"], ["gl_avenants", "date_signature"],
      ["gl_renouvellements", "date_effet"], ["gl_renouvellements", "date_signature"], ["gl_renouvellements", "nouvelle_date_fin"],
      ["gl_documents", "date_document"],
      ["alertes", "target_date"],
      ["ref_taux_emprunt", "date_releve"], ["ref_valeurs_venales", "date_releve"],
      ["ref_valeurs_locatives", "date_releve"], ["ref_taux_capitalisation", "date_releve"],
      ["ref_marche_scraping", "date_releve"],
    ];
    for (const [tbl, col] of dateColumnMigrations) {
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tbl}' AND column_name = '${col}' AND data_type = 'character varying'
          ) THEN
            ALTER TABLE "${tbl}" ALTER COLUMN "${col}" TYPE date USING "${col}"::date;
          END IF;
        END $$;
      `);
    }

    // ── Indexation unification: add missing columns to am_baux ──
    const amBauxNewCols: [string, string][] = [
      ["loyer_base_ht", "numeric"],
      ["loyer_ht_actu", "numeric"],
      ["force_manual", "boolean DEFAULT false"],
      ["date_indice_base", "date"],
    ];
    for (const [col, colType] of amBauxNewCols) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE "am_baux" ADD COLUMN "${col}" ${colType};
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    // Create am_indexations table (audit trail for AM bail indexation)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "am_indexations" (
        "id" varchar PRIMARY KEY NOT NULL,
        "bail_id" varchar NOT NULL REFERENCES "am_baux"("id") ON DELETE cascade,
        "date_application" date NOT NULL,
        "ancien_loyer" numeric,
        "nouveau_loyer" numeric,
        "indice_base" numeric,
        "indice_nouveau" numeric,
        "type_indice" varchar,
        "trimestre" varchar,
        "taux_variation" numeric,
        "notes" text,
        "created_at" timestamp DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_indexations_am_bail_id" ON "am_indexations" ("bail_id")`);

    // Unique constraint on indices to prevent duplicates
    await client.query(`
      DO $$ BEGIN
        CREATE UNIQUE INDEX "idx_indices_type_trimestre" ON "indices" ("type", "trimestre");
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);

    // Backfill loyerBaseHT/loyerHTActu from existing data where missing
    await client.query(`
      UPDATE "am_baux" SET
        "loyer_base_ht" = COALESCE("loyer_base_ht", "loyer_annuel"),
        "loyer_ht_actu" = COALESCE("loyer_ht_actu", "loyer_annuel")
      WHERE "loyer_annuel" IS NOT NULL AND "loyer_annuel" != '0'
        AND ("loyer_base_ht" IS NULL OR "loyer_ht_actu" IS NULL)
    `);

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
