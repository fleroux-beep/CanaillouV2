-- ============================================================
-- Unification des tables baux (am_baux ∪ gl_baux) et locataires
-- (am_locataires ∪ gl_locataires)
-- ============================================================
-- Objectif : une seule source de données pour les baux, partagée par
-- les deux interfaces "asset-management" (user = bailleur) et
-- "gestion-locative" (user = locataire). Indispensable pour que
-- l'indexation automatique INSEE puisse agir sur l'ensemble des baux.
--
-- Stratégie :
--   - On garde les noms physiques gl_baux / gl_locataires pour ne pas
--     avoir à recâbler les 7 tables enfants (paiements, factures,
--     quittances, indexations, avenants, renouvellements, documents).
--   - On ajoute à gl_baux les colonnes AM (lot_id, actif_id, sci_id,
--     loyer_mensuel, loyer_annuel, loyer_theorique) + un marqueur `scope`
--     qui permet à chaque UI de filtrer son périmètre d'origine.
--   - On copie les données am_locataires → gl_locataires (UUID préservés).
--   - On copie les données am_baux → gl_baux (scope='am', UUID préservés,
--     auto-détection de l'indice de référence si absent).
--   - On migre la FK am_lots.locataire_id vers gl_locataires.
--   - On drope am_baux et am_locataires.
-- ============================================================

-- 1. Étendre gl_baux avec les colonnes du périmètre Asset Management
ALTER TABLE "gl_baux" ADD COLUMN "scope" varchar DEFAULT 'gl' NOT NULL;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "lot_id" varchar;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "actif_id" varchar;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "sci_id" varchar;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "loyer_mensuel" numeric;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "loyer_annuel" numeric;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD COLUMN "loyer_theorique" numeric;--> statement-breakpoint

-- 2. Relâcher la contrainte NOT NULL sur gl_baux.nom : les baux AM importés
-- n'ont pas toujours de nom explicite, on en dérive un par défaut ci-dessous.
ALTER TABLE "gl_baux" ALTER COLUMN "nom" DROP NOT NULL;--> statement-breakpoint

-- 3. Backfill des champs miroirs pour les baux GL existants : les pages AM
-- lisent loyer_mensuel / loyer_annuel et ne connaissent pas loyer_ht_actu.
UPDATE "gl_baux"
SET "loyer_annuel" = "loyer_ht_actu",
    "loyer_mensuel" = ROUND(("loyer_ht_actu"::numeric / 12.0)::numeric, 2)
WHERE "loyer_annuel" IS NULL AND "loyer_ht_actu" IS NOT NULL;--> statement-breakpoint

-- 4. Ajouter les FKs vers am_lots / am_actifs / am_scis
ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_lot_id_am_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."am_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_actif_id_am_actifs_id_fk" FOREIGN KEY ("actif_id") REFERENCES "public"."am_actifs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_baux" ADD CONSTRAINT "gl_baux_sci_id_am_scis_id_fk" FOREIGN KEY ("sci_id") REFERENCES "public"."am_scis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 5. Indexes pour les nouvelles colonnes
CREATE INDEX IF NOT EXISTS "idx_baux_gl_scope" ON "gl_baux" ("scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_baux_gl_lot_id" ON "gl_baux" ("lot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_baux_gl_actif_id" ON "gl_baux" ("actif_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_baux_gl_sci_id" ON "gl_baux" ("sci_id");--> statement-breakpoint

-- 6. Copier les données am_locataires → gl_locataires (UUID préservés).
-- ON CONFLICT DO NOTHING : si une collision d'ID survenait, on la laisse
-- silencieusement — le propriétaire pourra déduper manuellement plus tard.
INSERT INTO "gl_locataires" (id, owner_id, nom, prenom, email, telephone, adresse, siret, notes, created_at, updated_at)
SELECT id, owner_id, nom, prenom, email, telephone, adresse, siret, notes, created_at, updated_at
FROM "am_locataires"
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

-- 7. Copier les données am_baux → gl_baux (scope='am', UUID préservés).
-- Auto-détection de l'indice de référence si absent, selon le type de bail :
--   - habitation / logement → IRL (légalement obligatoire depuis 2006)
--   - tertiaire / bureau / professionnel → ILAT
--   - commercial / boutique / crèche → ILC
--   - construction → ICC (rare)
--   - inconnu → on laisse NULL (sera géré manuellement)
INSERT INTO "gl_baux" (
  id, scope, nom, lot_id, actif_id, sci_id, locataire_id, type_bail,
  date_debut, date_fin, date_signature,
  loyer_mensuel, loyer_annuel, loyer_theorique, loyer_base_ht, loyer_ht_actu,
  charges, depot_garantie,
  indice_reference, trimestre_ref, valeur_indice_base,
  statut, notes, archived, deleted_at, created_at, updated_at
)
SELECT
  b.id,
  'am' AS scope,
  COALESCE(
    NULLIF(TRIM(CONCAT_WS(' — ', a.nom, l.designation, loc.nom)), ''),
    CONCAT('Bail ', LEFT(b.id, 8))
  ) AS nom,
  b.lot_id, b.actif_id, b.sci_id, b.locataire_id, b.type_bail,
  b.date_debut::timestamp, b.date_fin::timestamp, b.date_signature,
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
LEFT JOIN "gl_locataires" loc ON loc.id = b.locataire_id
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

-- 8. Forcer le NOT NULL sur gl_baux.nom maintenant que tous les baux ont un nom.
UPDATE "gl_baux" SET "nom" = CONCAT('Bail ', LEFT(id, 8)) WHERE "nom" IS NULL OR "nom" = '';--> statement-breakpoint
ALTER TABLE "gl_baux" ALTER COLUMN "nom" SET NOT NULL;--> statement-breakpoint

-- 9. Migrer la FK am_lots.locataire_id : elle pointe sur am_locataires, il faut
-- qu'elle pointe désormais sur gl_locataires avant de pouvoir droper am_locataires.
ALTER TABLE "am_lots" DROP CONSTRAINT IF EXISTS "am_lots_locataire_id_am_locataires_id_fk";--> statement-breakpoint
ALTER TABLE "am_lots" ADD CONSTRAINT "am_lots_locataire_id_gl_locataires_id_fk" FOREIGN KEY ("locataire_id") REFERENCES "public"."gl_locataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 10. Droper les tables legacy
DROP TABLE "am_baux" CASCADE;--> statement-breakpoint
DROP TABLE "am_locataires" CASCADE;
