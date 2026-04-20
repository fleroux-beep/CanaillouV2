# AUDIT CONSOLIDÉ — CanaillouV2

**Date** : 20 avril 2026
**Périmètre** : audit intégral (métier, schéma, serveur, client UI, tests/qualité, sécurité)
**Méthode** : 6 agents parallèles, un axe chacun, rapports détaillés dans ce dossier.

---

## Navigation des rapports détaillés

| Axe | Fichier | Findings |
|-----|---------|----------|
| 1. Métier | [`01-metier.md`](./01-metier.md) | 0 P0 · 6 P1 · 3 P2 |
| 2. Schéma & données | [`02-schema.md`](./02-schema.md) | 2 P0 · 5 P1 · 4 P2 |
| 3. Serveur | [`03-serveur.md`](./03-serveur.md) | 2 P0 · 5 P1 · 6 P2 |
| 4. Client UI | [`04-client.md`](./04-client.md) | 3 P0 · 12 P1 · 8 P2 |
| 5. Tests & qualité | [`05-qualite.md`](./05-qualite.md) | 5 actions P0 · 6 P1 · 4 P2 |
| 6. Sécurité | [`06-securite.md`](./06-securite.md) | 4 P0 · 3 P1 · 4 P2 |

**Compteur total** : ~16 P0 · ~37 P1 · ~29 P2

---

## Score global par axe

| Axe | Score | Verdict |
|-----|-------|---------|
| Sécurité (hors deps) | 8/10 | ✅ Solide (CSRF, auth, SQL, CSP tous OK) |
| Architecture serveur | 7/10 | ✅ Propre, mais race conditions mineures |
| Métier | 6/10 | ⚠️ Règles correctes mais non respectées partout |
| Schéma | 6/10 | ⚠️ Cohérent mais drift schema.ts ↔ ensure-schema.ts |
| Client UI | 5/10 | 🔴 Duplication massive, états loading/error incomplets |
| Tests & qualité | 4/10 | 🔴 Couverture 3,1 %, import-excel non testé |
| **Global** | **6/10** | Fonctionnel mais dette technique significative |

---

## P0 — Bloquants avant release (16 findings)

### Sécurité dépendances (4)
1. **`xlsx@0.18.5`** — prototype pollution non patchable. → migrer vers `exceljs`. Endpoints `/api/import-wizard/upload-excel`, `/api/admin/import-excel`. (06-securite.md §1)
2. **`drizzle-orm@0.39.3`** — SQL injection sur identifiants (code actuel safe, mais upgrade requis). → `npm audit fix --force` vers 0.45.2+. (06-securite.md §1)
3. **`node-tar`** transitive via bcrypt — path traversal (dev-only). (06-securite.md)
4. **Vite dev server OBOS** — DEV uniquement. (06-securite.md)

### Intégrité & bugs production (5)
5. **Race condition pagination** (`server/lib/crud-factory.ts:103-115`) — `orderBy(createdAt)` sans secondary sort. Doublons/omissions en bulk insert. (03-serveur.md §P0.1)
6. **SESSION_SECRET crash silencieux** (`server/index.ts:80-87`) — fallback mort, crash au démarrage en prod. (03-serveur.md §P0.2)
7. **FK manquante sur `gl_baux_franchises`** (`server/ensure-schema.ts:797-807`) — franchises orphelines possibles. (02-schema.md §P0.1)
8. **Drift `gl_baux.nom`** — `NOT NULL` dans schema.ts mais nullable en DB (ensure-schema.ts:745). (02-schema.md §P0.2)
9. **Form double-submit** (`client/src/components/ui/form-dialog.tsx:116-126`) — création de doublons sur connexion lente. (04-client.md §P0.3)

### UX/métier critique (3)
10. **`forceManual` absent de GL Baux** (`client/src/pages/gestion-locative/Baux.tsx`) — utilisateurs GL ne peuvent pas forcer un loyer manuel. (04-client.md §P0.1)
11. **`BailAM` manque `loyerManuelOverride`** (`client/src/types/am.ts:136-165`) — drift type, risque refactor. (04-client.md §P0.2)

### Tests absents sur code critique (comptés dans 05-qualite)
12. Aucun test sur `import-excel.ts` (1 528 lignes) — risque corruption data sur réimport.
13. Aucun test sur `sync-insee.ts` — indexation automatique silencieusement cassée possible.
14. Aucun test sur `validation.ts` — bypass Zod non détecté.
15. **32 duplications du calcul loyer** — si priorité change, 32 fichiers divergeront.
16. ESLint absent — dérive qualité non détectée en CI.

---

## P1 — À corriger rapidement (sélection — voir rapports)

**Métier (6)** — [01-metier.md](./01-metier.md)
- `forceManual` ignoré sur 15 pages GL/AM (KPIs faux)
- Franchises jamais appliquées aux calculs affichés
- Import Excel fallback sur `loyer_ht_actu` écrase `loyer_base_ht`
- TVA appliquée à la volée, pas d'historique
- Statut "résilié" non normalisé unicode
- Format trimestre Excel non validé

**Schéma (5)** — [02-schema.md](./02-schema.md)
- Pas de CHECK `montant >= 0` sur franchises
- `montant_loyer/charges/total` quittances nullables (cash-flow invalide)
- Bail peut exister sans locataire ni bailleur
- Tous loyers peuvent être NULL simultanément
- Soft delete incohérent (`archived` vs `deletedAt`)

**Serveur (5)** — [03-serveur.md](./03-serveur.md)
- Validation UUID incohérente (400 vs 404)
- Stack traces exposées en prod
- Géocodage non atomique post-import
- MIME type non validé sur upload
- N+1 sur indices INSEE

**Client (12)** — [04-client.md](./04-client.md)
- `useCrud` sans état `isError` (25 pages affectées)
- DataTable ne distingue pas loading/empty/error
- Incohérence calcul loyer entre pages
- Badges M/↗ manquants en GL
- Responsive cassé sur Dashboard

**Sécurité (3)** — [06-securite.md](./06-securite.md)
- `SESSION_SECRET` faible en dev
- Pas d'endpoint GDPR right-to-deletion
- Validation UUID DELETE /users/:id

---

## Actions immédiates — roadmap 3 sprints

### Sprint 1 (1 semaine) — sécurité & intégrité
- [ ] `npm audit fix --force` + migration `xlsx` → `exceljs`
- [ ] Ajouter `.id` au secondary sort CRUD factory
- [ ] Corriger fallback `SESSION_SECRET`
- [ ] Ajouter FK `gl_baux_franchises.bail_id` via migration idempotente
- [ ] Aligner `gl_baux.nom` NOT NULL dans ensure-schema.ts
- [ ] Désactiver double-submit form-dialog

### Sprint 2 (2 semaines) — cohérence métier & UI
- [ ] Créer `shared/utils/bail.ts:getBailLoyer()` et remplacer les 32 duplications
- [ ] Ajouter toggle `forceManual` + override dans GL Baux
- [ ] Ajouter `loyerManuelOverride` dans `types/am.ts`
- [ ] Normaliser `statut` résilié (fonction `normResilie`)
- [ ] Implémenter franchises GL (helper + UI + endpoint)
- [ ] Normaliser format trimestre en import-excel.ts + migration base
- [ ] Ajouter états `isError` à `useCrud` et `DataTable`

### Sprint 3 (2 semaines) — tests & qualité
- [ ] Tests unitaires `import-excel.ts` (parsage + fallback)
- [ ] Tests unitaires `sync-insee.ts` (indexation + format trimestre)
- [ ] Tests unitaires `validation.ts` (schémas Zod)
- [ ] ESLint + `tsc --noEmit` dans CI
- [ ] `noUncheckedIndexedAccess` dans tsconfig
- [ ] Refactorer `importBaux()` / `importEmprunts()` (> 150 lignes)

**Effort total estimé** : ~100 heures dev senior.

---

## Forces constatées ✅

- **Sécurité runtime** : CSP + CSRF + bcrypt(12) + cookies httpOnly+secure+sameSite strict
- **SQL injection** : Drizzle + parameterized queries partout, aucun `sql.raw` dangereux
- **Rate limiting** : login 10/15min, import 10/min, chat 30/5min
- **`am-calculations.ts`** : 93 tests, edge cases couverts, documentation métier excellente
- **TypeScript `strict: true`** activé globalement
- **Commentaires métier** riches dans le code critique (INSEE, loyers)
- **Pas de dépendance abandonnée** hors vulnérabilités ciblées
- **Transactions DB + retry logic** dans import Excel

---

## Méthodologie

6 agents spécialisés lancés en parallèle :
- Agent Métier : lecture REGLES_METIER.md + vérification code
- Agent Schéma : schema.ts ↔ ensure-schema.ts + cohérence FK/types
- Agent Serveur : routes, validation, sync-insee, auth, erreurs
- Agent Client UI : pages, composants, états, accessibilité
- Agent Qualité : couverture tests, duplications, dette technique
- Agent Sécurité : OWASP + dépendances + GDPR

Chaque agent a produit son rapport détaillé (file:line partout). Ce document consolide et priorise.

---

**Prochaines étapes** : choisir 1 ou 2 chantiers Sprint 1 et les implémenter.
