# AUDIT SCHÉMA PostgreSQL/Drizzle — SCI Immobilière (CanaillouV2)

## Résumé Exécutif

Audit des fichiers `/shared/schema.ts` et `/server/ensure-schema.ts` pour une app TypeScript/Drizzle ORM/PostgreSQL (Railway) de gestion SCI immobilière française.

**Critère P0** (risque de perte/corruption data) : 2 findings  
**Critère P1** (bug probable, requête cassée) : 5 findings  
**Critère P2** (hygiène) : 4 findings  

---

## P0 — Risques de Perte/Corruption de Données

### P0.1 : gl_baux_franchises manquant de FK dans ensure-schema.ts

**Localisation** : `/server/ensure-schema.ts:797-807`

**Problème** :
- La table `gl_baux_franchises` est créée DEUX FOIS : une première fois dans la migration 0003 (ligne 399-409 en transaction séparée) et une seconde dans la CREATE TABLE IF NOT EXISTS du big transaction (ligne 797-807).
- **PLUS GRAVE** : dans la seconde création (ensure-schema), la colonne `bail_id` n'a PAS de contrainte FOREIGN KEY définie dans le CREATE TABLE. Elle est déclarée `varchar NOT NULL` mais sans `REFERENCES`.
- La FK est censée être ajoutée via le bloc ALTER TABLE ligne 1156, mais si la table existe déjà du premier CREATE (migration 0003), cette FK supplémentaire n'est jamais appliquée sur la colonne en ensure-schema.ts:799.

**Conséquence** :
- Une franchise orpheline peut être créée avec un `bail_id` invalide sans violation de contrainte.
- Intégrité référentielle brisée : une franchise peut pointer vers un bail inexistant ou supprimé sans cascade.
- Risque de perte silencieuse de data lors du DELETE d'un bail.

**Fix suggéré** (SQL) :
```sql
-- 1. Supprimer la migration 0003 du CREATE TABLE et laisser ensure-schema la gérer
-- 2. Dans ensure-schema.ts ligne 797-807, ajouter la FK :
CREATE TABLE IF NOT EXISTS "gl_baux_franchises" (
  "id" varchar PRIMARY KEY NOT NULL,
  "bail_id" varchar NOT NULL REFERENCES "gl_baux"("id") ON DELETE CASCADE,
  "date_debut" date NOT NULL,
  "date_fin" date NOT NULL,
  "montant" numeric NOT NULL,
  "motif" varchar,
  "notes" text,
  "created_at" timestamp DEFAULT now()
);
```

**Fix suggéré** (TS) :  
Refactoriser `applyLoyerManuelOverrideMigration()` pour ne pas créer la table — laisser ensure-schema.ts le faire une seule fois avec la FK correcte.

---

### P0.2 : Drift schema.ts ↔ ensure-schema.ts sur gl_baux.nom

**Localisation** :  
- `schema.ts:311` : `nom: varchar("nom").notNull()`
- `ensure-schema.ts:745` : `"nom" varchar,` (nullable)

**Problème** :
- **schema.ts déclare `nom` comme NOT NULL**, mais **ensure-schema.ts le crée nullable**.
- Migration 0001 (ligne 162-168) tente de combler ce gap en UPDATE 'Bail...' sur les NULLs, mais cette UPDATE n'est **pas garantie** d'être exécutée avant la ALTER TABLE SET NOT NULL.
- Si un bail est créé entre la CREATE TABLE et la UPDATE, le NOT NULL constraint ne sera jamais appliqué puisque ensure-schema ne le met pas en place.

**Conséquence** :
- Lecture Drizzle côté TS : `.notNull()` → obligation de fournir `nom` lors de la création.
- Réalité DB : colonne peut être NULL → désynchronisation O/R.
- INSERT via API sans `nom` échouera, mais **INSERT via le job de migration réussira**, créant des baux avec `nom=NULL`.

**Fix suggéré** (SQL) :
```sql
-- Dans ensure-schema.ts ligne 745, changer :
"nom" varchar NOT NULL,  -- au lieu de varchar,
```

ET assurer que la UPDATE ligne 164-168 est idempotente avant de demander NOT NULL.

---

## P1 — Bugs Probables

### P1.1 : Franchises montant nullable alors qu'il devrait être checké

**Localisation** :  
- `schema.ts:421` : `montant: numeric("montant").notNull()`
- `ensure-schema.ts:802` : `"montant" numeric NOT NULL`

**OK ici**, mais **pas de CHECK constraint** pour garantir que `montant >= 0`.

**Problème** :
- Une franchise peut avoir `montant = -500` (remboursement implicite ?).
- Calcul du cash-flow : `loyer_annuel - SUM(montant)` peut être artificiel.
- Aucune validation à la BDD, juste côté client.

**Conséquence** :
- Bug d'arrondi ou calcul erroné du cash-flow net pour l'année.
- Audit financier futur incohérent.

**Fix suggéré** (SQL) :
```sql
ALTER TABLE "gl_baux_franchises" ADD CONSTRAINT "chk_franchise_montant" 
  CHECK ("montant" IS NULL OR "montant" >= 0);
```

---

### P1.2 : Paiement montant nullable dans schema.ts vs NOT NULL en ensure-schema.ts

**Localisation** :  
- `schema.ts:437` : `montant: numeric("montant").notNull()`
- `ensure-schema.ts:815` : `"montant" numeric NOT NULL`

**OK**, cohérent.

BUT : **Quittance montantLoyer/montantCharges NULLABLE sans valeur par défaut**

`schema.ts:473-475` :
```ts
montantLoyer: numeric("montant_loyer"),      // NULLABLE
montantCharges: numeric("montant_charges"),  // NULLABLE
montantTotal: numeric("montant_total"),      // NULLABLE
```

**Problème** :
- Une quittance peut être créée sans montants (tous NULL).
- Requête `SELECT SUM(montant_total) FROM gl_quittances WHERE bail_id = $1` retourne NULL si une seule quittance est vide.
- Rapport financier brisé.

**Conséquence** :
- Cash-flow agrégé invalide.
- Alertes financières manquées.

**Fix suggéré** :
- Soit rendre obligatoire au moins `montantTotal` : `montantTotal: numeric("montant_total").notNull()`.
- Soit ajouter un trigger qui recalcule `montantTotal = COALESCE(montantLoyer, 0) + COALESCE(montantCharges, 0)` si NULL.

---

### P1.3 : FK gl_baux.locataireId/bailleurId on DELETE set null sans constraint NOT NULL

**Localisation** :  
- `schema.ts:317-318` : FK vers locataireId/bailleurId `on DELETE set null`
- `schema.ts:311` : `nom` NOT NULL

**Problème** :
- Si `locataireId` et `bailleurId` sont tous deux supprimés (via DELETE RESTRICT ou autre), un bail n'a plus ni locataire ni bailleur mais conserve `nom`.
- Bail orphelin invalide : impossible de reconstruire la relation.
- Pas de CHECK constraint pour garantir `(locataireId IS NOT NULL OR bailleurId IS NOT NULL)`.

**Conséquence** :
- Requête `SELECT * FROM gl_baux WHERE scope='gl' AND locataire_id IS NULL AND bailleur_id IS NULL` peut retourner des lignes valides en apparence mais inutilisables.

**Fix suggéré** (SQL) :
```sql
ALTER TABLE "gl_baux" ADD CONSTRAINT "chk_bail_parties" 
  CHECK ("locataire_id" IS NOT NULL OR "bailleur_id" IS NOT NULL);
```

---

### P1.4 : loyer_base_ht et loyer_ht_actu NULLABLE sans cohérence

**Localisation** :  
- `schema.ts:362-363` : `loyerBaseHT` et `loyerHTActu` sont NULLABLE
- Commentaire schema.ts:356-358 : lecture prioritaire forceManual > loyerHTActu > loyerBaseHT

**Problème** :
- Aucune des trois sources (forceManual/override, loyerHTActu, loyerBaseHT) n'est obligatoire.
- Un bail peut avoir `loyer_base_ht=NULL`, `loyer_ht_actu=NULL`, `forceManual=false`, `loyer_manuel_override=NULL` → **loyer total=NULL**.
- Requête côté client `getBailLoyerAnnuel()` failera silencieusement ou retournera undefined.

**Conséquence** :
- Baux sans loyer affichés comme "0" ou ignorés dans les agrégations.
- Risque de pertes de revenus non détectées.

**Fix suggéré** :
- Ajouter CHECK constraint : `("loyer_base_ht" IS NOT NULL OR "forceManual" = true AND "loyer_manuel_override" IS NOT NULL)`
- OU rendre obligatoire au minimum `loyer_base_ht` sur création.

---

### P1.5 : Soft delete inconsistency (deletedAt vs archived)

**Localisation** :  
- `schema.ts` : certaines tables ont `archived` (actifs, lots, emprunts, baux), d'autres ont `deletedAt` (scis, bailleurs).
- `schema.ts:66, 143, 169, 203, 230, 253, 268, 289, 387` : `deletedAt: timestamp("deleted_at")`
- `schema.ts:142, 168, 202, 386` : `archived: boolean("archived").default(false)`

**Problème** :
- Pas de convention unique : soft delete ou hard delete ?
- Requêtes doivent vérifier **BOTH** `WHERE deleted_at IS NULL AND archived = false` (ou juste l'un ou l'autre).
- Risque de requête oubliant un filtre et ramenant des données supprimées.

**Conséquence** :
- SCIs "supprimées" réapparaissent si requête oublie `deleted_at IS NULL`.
- Baux archivés et supprimés doublement sur certaines vues.

**Fix suggéré** :
- Choisir UNE seule approche : soit `deleted_at` partout, soit `archived` partout.
- Ajouter à la base une VUE ou un scope de requête systématique : `WHERE deleted_at IS NULL`.

---

## P2 — Hygiène et Dettes Techniques

### P2.1 : Types numériques sans précision (numeric vs numeric(12,2))

**Localisation** :  
- `schema.ts:49, 91, 122, 128, 131, 187, 372, 421, 437, 473-475` : `numeric` sans paramètre
- Concerne : capital, montantApport, chargesAnnuelles, loyer_base_ht, montant_loyer, etc.

**Problème** :
- `numeric` sans précision peut accepter 38+ chiffres significatifs.
- Arrondi BANKER'S (par défaut) peut donner des surprises : `0.55 * 2 ≠ 1.1` en PostgreSQL.
- Aucun contrôle de taille : capital peut être `999999999999999999999.99999999`.

**Conséquence** :
- Rapports financiers avec 20 décimales au lieu de 2.
- Migration depuis autre BDD perd la précision attendue.
- Pas d'erreur si un montant est invalide (trop grand/petit).

**Fix suggéré** :
```ts
// Dans schema.ts, remplacer tous les `numeric` par :
loyerBaseHT: numeric("loyer_base_ht", { precision: 12, scale: 2 }),
montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
// etc.
```

En SQL :
```sql
ALTER TABLE "gl_baux" ALTER COLUMN "loyer_base_ht" TYPE numeric(12, 2);
```

---

### P2.2 : Pas d'index sur (scope, statut) pour queries GL/AM filtrées

**Localisation** :  
- `ensure-schema.ts:1103` : `CREATE INDEX idx_baux_gl_scope` sur `scope` seul
- Pas d'index composite sur (scope, statut) ou (scope, created_at)

**Problème** :
- Requête typique : `SELECT * FROM gl_baux WHERE scope='gl' AND statut='actif' ORDER BY created_at DESC`
- Sans index composite, scan complet de la table puis filtre.
- Performance dégradée à 10k+ baux.

**Conséquence** :
- Dashboard "Baux actifs" ralentit considérablement.
- Risque N+1 si chaque utilisateur lance plusieurs requêtes filtrant sur scope+statut.

**Fix suggéré** (SQL) :
```sql
CREATE INDEX idx_baux_gl_scope_statut ON "gl_baux"("scope", "statut");
CREATE INDEX idx_baux_gl_scope_created ON "gl_baux"("scope", "created_at" DESC);
```

---

### P2.3 : Pas de CHECK sur `pourcentage` dans am_participations

**Localisation** :  
- `ensure-schema.ts:1168` : CHECK constraint existe pour `pourcentage` (0-100)
- `schema.ts:90` : `pourcentage: numeric("pourcentage")` déclaration simple

**OK ici**, mais **`parts_sociales` et `montantApport` SANS constraints**

**Problème** :
- Parts sociales peuvent être négatives ou nulles sans sens.
- Montant d'apport peut être 0 pour un associé qui devrait avoir apporté de l'argent.

**Conséquence** :
- Associé enregistré avec parts=-50 ou apport=0 (impossible légalement).
- Audit comptable échoue sur ces associations.

**Fix suggéré** :
```sql
ALTER TABLE "am_participations" ADD CONSTRAINT "chk_parts_sociales" 
  CHECK ("parts_sociales" IS NULL OR "parts_sociales" > 0);
ALTER TABLE "am_participations" ADD CONSTRAINT "chk_montant_apport" 
  CHECK ("montant_apport" IS NULL OR "montant_apport" >= 0);
```

---

### P2.4 : Pas de UNIQUE constraint sur business key (bail identifier)

**Localisation** :  
- `schema.ts:307-399` (bauxGL table)
- Aucun UNIQUE sur combinaison (lotId, scope, actifId) ou (nom, sciId, scope)

**Problème** :
- Deux baux pour le même lot peuvent exister → double comptage du loyer.
- Aucune garantie qu'un bail est unique (sauf par clé primaire UUID).

**Conséquence** :
- Import Excel peut créer des doublons silencieusement.
- Agrégation `GROUP BY lot_id` double-compte les loyers si 2 baux même actifs.

**Fix suggéré** :
```sql
-- Ajouter UNIQUE sur (lot_id, scope) si lot_id NOT NULL :
ALTER TABLE "gl_baux" ADD CONSTRAINT "uq_baux_lot_scope" 
  UNIQUE (lot_id, scope) WHERE lot_id IS NOT NULL;
```

---

## Tableau Récapitulatif — Colonnes Suspectes

| Table | Colonne | Type | Nullable | Default | Risque | Recommandation |
|-------|---------|------|----------|---------|--------|-----------------|
| gl_baux | nom | varchar | ✗ TS / ✓ DB | NULL | P0.2 Drift | NOT NULL |
| gl_baux | loyer_base_ht | numeric | ✓ | NULL | P1.4 | CHECK (NOTNULL OR forceManual) |
| gl_baux | loyer_ht_actu | numeric | ✓ | NULL | P1.4 | CHECK (NOTNULL OR forceManual) |
| gl_baux | forceManual | boolean | ✗ | false | OK | OK |
| gl_baux | loyer_manuel_override | numeric | ✓ | NULL | P1.4 | CHECK (NOTNULL si forceManual=true) |
| gl_baux | locataire_id | varchar | ✓ | NULL | P1.3 | CHECK (NOTNULL OR bailleur_id NOTNULL) |
| gl_baux | bailleur_id | varchar | ✓ | NULL | P1.3 | CHECK (NOTNULL OR locataire_id NOTNULL) |
| gl_baux | charges | numeric | ✓ | NULL | P2 | numeric(12,2) |
| gl_baux | depot_garantie | numeric | ✓ | NULL | P2 | numeric(12,2) |
| gl_baux | garantie_montant | numeric | ✓ | NULL | P2 | numeric(12,2) CHECK >= 0 |
| gl_baux_franchises | bail_id | varchar | ✗ | NULL | P0.1 | FK missing in ensure-schema |
| gl_baux_franchises | montant | numeric | ✗ | NULL | P1.1 | CHECK >= 0 |
| gl_quittances | montant_loyer | numeric | ✓ | NULL | P1.2 | NOT NULL OR trigger calc |
| gl_quittances | montant_charges | numeric | ✓ | NULL | P1.2 | NOT NULL OR trigger calc |
| gl_quittances | montant_total | numeric | ✓ | NULL | P1.2 | NOT NULL |
| am_actifs | prix_acquisition | numeric | ✓ | NULL | P2 | numeric(12,2) |
| am_actifs | charges_annuelles | numeric | ✓ | NULL | P2 | numeric(12,2) |
| am_emprunts | montant_emprunte | numeric | ✓ | NULL | P2 | numeric(12,2) CHECK >= 0 |
| am_emprunts | capital_restant_du | numeric | ✓ | NULL | P2 | numeric(12,2) CHECK >= 0 |
| am_participations | parts_sociales | numeric | ✓ | NULL | P2.3 | numeric(12,0) CHECK > 0 |
| am_participations | pourcentage | numeric | ✓ | NULL | OK | CHECK 0-100 exists |
| am_participations | montant_apport | numeric | ✓ | NULL | P2.3 | numeric(12,2) CHECK >= 0 |
| * | archived | boolean | ✗ | false | P1.5 | Soft delete strategy |
| * | deleted_at | timestamp | ✓ | NULL | P1.5 | Soft delete strategy |

---

## Migration Idempotentes — Analyse

### Colonne scope
- ✓ Migration 0001 (ensure-schema.ts:30-38) : ADD COLUMN IF NOT EXISTS `scope`
- ✓ Backfill INSERT gl_baux FROM am_baux avec scope='am' (ligne 127)
- ✓ Idempotent : ON CONFLICT (id) DO NOTHING

### Colonne loyer_base_ht / loyer_ht_actu
- ✓ Migration 0002 (ensure-schema.ts:223-242) : UPDATE FROM loyer_annuel
- ✓ Fallback si colonne déjà droppée (ligne 262-270)
- ⚠️ **RISQUE** : loyer_annuel peut être modifié APRÈS migration 0001 et AVANT migration 0002 → édition perdue

### Colonne loyer_manuel_override + forceManual
- ✓ Migration 0003 (ensure-schema.ts:366-391) : ADD COLUMN, ALTER NOT NULL
- ✓ Idempotent : ADD IF NOT EXISTS
- ✓ Backfill forceManual=false sur NULLs

---

## Recommendations Prioritaires

1. **URGENT (P0)** :
   - Fixer la FK manquante sur gl_baux_franchises.bail_id
   - Ajouter NOT NULL sur gl_baux.nom dans ensure-schema.ts

2. **HIGH (P1)** :
   - Ajouter CHECK constraints sur montants (>= 0)
   - Rendre obligatoire au moins l'un de (loyer_base_ht, loyer_manuel_override)
   - Unifier politique soft delete (deletedAt vs archived)

3. **MEDIUM (P2)** :
   - Remplacer `numeric` par `numeric(12, 2)` partout
   - Ajouter index composites sur (scope, statut), (scope, created_at)
   - Ajouter UNIQUE constraint sur (lot_id, scope)

---

## Correspondance schema.ts ↔ ensure-schema.ts

**Vérification table-par-table** :

✓ users, sessions → complètes et cohérentes  
✓ am_scis, am_associes, am_participations → OK  
✓ am_actifs, am_lots, am_emprunts, am_travaux → OK  
✓ gl_bailleurs, gl_gestionnaires, gl_locataires → OK  
⚠️ **gl_baux** → drift sur `nom` (NOT NULL vs nullable)  
⚠️ **gl_baux_franchises** → FK manquante en ensure-schema.ts main transaction  
✓ gl_paiements, gl_factures, gl_quittances → OK (structure)  
✓ gl_indexations, gl_avenants, gl_renouvellements → OK  
✓ indices, ref_* tables → OK  

---

## Conclusion

Le schéma est **globalement sain** mais souffre de :
- **2 dérivations critiques** (P0) nécessitant correction immédiate
- **5 bugs logiques** (P1) pouvant causer perte de data ou calculs incorrects
- **4 dettes d'hygiène** (P2) affectant maintenabilité et performance long-terme

L'approche des **migrations idempotentes en transactions séparées** (0001, 0002, 0003) est judicieuse mais **exposée aux édits concurrents** entre phases — risque atténué par le backfill inconditionnelle en 0002.

