# AUDIT QUALITÉ & TESTS — CanaillouV2

## Résumé Exécutif

| Métrique | Valeur | État |
|----------|--------|------|
| Lignes de code total | 37 476 | ⚠️ |
| Lignes de tests | 1 196 | 🔴 ratio 3,1 % |
| Fichiers TS/TSX | 130 (87 client, 43 server) | — |
| Exports testés (estimé) | ~25 % | 🔴 |
| Duplication logique loyer | 32 occurrences | 🔴 |
| TypeScript `strict` | `true` | ✅ |
| ESLint configuré | Absent | 🔴 |
| CI/CD | Minimal | ⚠️ |

**Score qualité global : 4,2 / 10**

---

## 1. Couverture des tests

### 1.1 Fichiers testés ✅

**Client** (`/client/src/lib/__tests__/`)
- `am-calculations.test.ts` — 917 lignes, 93 cas. Couverture exhaustive, edge cases (null, 0, négatif, grandes valeurs), division par zéro protégée, tests de stress, amortissement.
- `utils.test.ts` — 98 lignes, 28 cas. Formatage devises/dates/nombres FR validés.

**Serveur** (`/server/lib/__tests__/`)
- `crud-factory.test.ts` — 65 lignes, 10 cas. Uniquement `paramId()` testé, CRUD complet non couvert.
- `geocode.test.ts` — 52 lignes, 10 cas. Seulement `needsGeocoding()`.
- `rate-limit.test.ts` — 69 lignes, 7 cas. Bon.

### 1.2 Fichiers critiques NON testés — P0

| Fichier | Lignes | Fonctions | Risque |
|---------|--------|-----------|--------|
| `/server/import-excel.ts` | 1 528 | 14 | 🔴 Parsage Excel, transformation données |
| `/server/lib/sync-insee.ts` | 346 | 3 | 🔴 Indexation automatique des loyers |
| `/server/lib/validation.ts` | 509 | 20+ | 🔴 Validation Zod de toutes les entrées API |
| `/server/lib/sync-dvf.ts` | 234 | 2 | 🔴 Données publiques DVF |
| `/server/lib/sync-anil.ts` | 221 | 2 | 🔴 Données ANIL |
| `/server/lib/crud-factory.ts` | 214 | 4 | 🔴 Générateur CRUD générique |
| `/server/lib/compute-taux-capi.ts` | 115 | 1 | 🔴 Calcul taux de capitalisation |
| `/server/lib/auto-sync-marche.ts` | 274 | 2 | 🔴 Synchronisation marché |

**Total non testé serveur : ~2 500 lignes (38 % du serveur)**

### 1.3 Edge cases manquants

- `/server/import-excel.ts:24-39` (`excelDateToISO`) : pas de tests pour dates malformées, serials < 1000, chaînes "Vefa le 01/07/2022".
- `/server/import-excel.ts:41-46` (`num`) : pas de tests pour "non trouvé", négatifs invalides.
- `/server/lib/sync-insee.ts:79-97` (`parseInseeXmlResponse`) : XML mal formé, observations manquantes, périodes invalides.
- `/server/lib/validation.ts` : aucun test du middleware `validate()`, email/password, Zod coerce.

---

## 2. Duplications

### 2.1 Duplication critique P0 — calcul loyer

Le pattern `Number(bail.loyerHTActu || bail.loyerBaseHT || 0)` apparaît **32 fois** au lieu de réutiliser `getBailLoyerAnnuel()`.

**Client (26 occurrences)**
- `client/src/pages/asset-management/ActifDetail.tsx:165`
- `client/src/pages/asset-management/Baux.tsx:51` (la fonction existe déjà dans le fichier mais pas réutilisée)
- `client/src/pages/asset-management/Arbitrages.tsx`, `Dashboard.tsx` (3×), `Lots.tsx:145`, `VuePatrimoine.tsx` (5×)
- `client/src/pages/gestion-locative/Alertes.tsx` (2×), `BailDetail.tsx` (3×), `Baux.tsx` (3×)
- `client/src/pages/gestion-locative/ControleBailleur.tsx` (7 occurrences)
- `client/src/pages/gestion-locative/Dashboard.tsx` (3×), `Indices.tsx` (3×), `KPI.tsx` (3×), `Projections.tsx` (2×)

**Serveur (6 occurrences)**
- `server/routes/alertes-proactives.ts:165`
- `server/routes/am-marche.ts` (3×)
- `server/routes/chat.ts` (2×)
- `server/routes/projections-predictives.ts`, `score-sante.ts`

**Risque** : si la priorité `forceManual → loyerHTActu → loyerBaseHT` change, 32 endroits à modifier. Divergences client/serveur garanties.

**Fix P0** : créer `shared/utils/bail.ts` avec `getBailLoyer()` partagé client/serveur.

### 2.2 Duplication serveur — routes calcul loyer

Helper `server/lib/bail-utils.ts:getBailLoyer()` à créer.

### 2.3 Code potentiellement mort

`/server/import-excel.ts:269-501` — fallback parsers (`parsePatrimoine`, `parseBaux`, `parseFinancement`, `parseDetention`, `parseEmprunts`). Appelés uniquement si `parseBDDSheet()` échoue, aucun test ne vérifie ce chemin.

---

## 3. Complexité & Maintenabilité

### 3.1 Fonctions surdimensionnées

| Fonction | Fichier | Lignes | Complexité |
|----------|---------|--------|-----------|
| `parseBDDSheet()` | `/server/import-excel.ts:172` | 93 | Imbrication 4+ niveaux |
| `importBaux()` | `/server/import-excel.ts:850+` | 200+ | 🔴 Très haute |
| `importEmprunts()` | `/server/import-excel.ts:1100+` | 150+ | 🔴 Très haute |
| `syncIndicesINSEE()` | `/server/lib/sync-insee.ts:130+` | 120+ | Boucles imbriquées |
| `autoIndexBaux()` | `/server/lib/sync-insee.ts:265+` | 82 | Try/catch imbriqué |

**Fix P1** : extraire `importBaux()` et `importEmprunts()` en fonctions < 50 lignes.

### 3.2 Noms cryptiques

- `num()`, `str()`, `id()` — trop courts → renommer `parseNumber()`, `parseString()`.

### 3.3 Cast dangereux

`/server/import-excel.ts:174` : `as any[][]` — perte de type.

---

## 4. TypeScript Strictness

**Activé ✅**
```json
"strict": true,
"skipLibCheck": true,
"forceConsistentCasingInFileNames": true
```

**Non activé 🔴**
- `noUncheckedIndexedAccess` — accès tableau non vérifiés
- `exactOptionalPropertyTypes` — optionals loose
- `noFallthroughCasesInSwitch`

**Fix P2** : activer `noUncheckedIndexedAccess` en priorité.

---

## 5. Dépendances

### 5.1 Aucune dépendance obsolète ✅

- `@anthropic-ai/sdk` ^0.80.0, `zod` ^3.24.2, `drizzle-orm` ^0.39.3, `express` ^5.0.1 — récents.

### 5.2 Dépendance morte

`playwright-core` dans `package.json:57` — 0 import dans le code. **Fix P2** : supprimer ou activer pour E2E.

---

## 6. Commentaires & Documentation

- Aucun TODO/FIXME/HACK détecté. Peut indiquer soit une bonne hygiène, soit un défaut de traçabilité des dettes.
- Commentaires métier **excellents** dans `import-excel.ts`, `sync-insee.ts`, `am-calculations.ts` (historique bugs INSEE, explications mappings, priorités loyer).

---

## 7. Build & CI/CD

### 7.1 CI Pipeline ⚠️

`.github/workflows/ci.yml` (22 lignes) :
```yaml
- run: npm ci
- run: npx tsx scripts/verify-schema.ts
- run: npx vitest run
```

**Manque** :
- ESLint (aucune config)
- `tsc --noEmit` type-check
- Tests E2E
- Coverage report
- `npm audit` sécurité

### 7.2 Scripts manquants (package.json)

```json
"lint": "eslint . --ext .ts,.tsx",
"lint:fix": "eslint . --ext .ts,.tsx --fix",
"type-check": "tsc --noEmit"
```

### 7.3 Pas de pre-commit hooks

Aucun `.husky/`. **Fix P2** : ajouter husky + lint-staged.

---

## 8. Statistiques globales

| Module | Lignes | Tests | Ratio |
|--------|--------|-------|-------|
| `/client/src/lib/` | 1 480 | 1 015 | **68,6 %** ✅ |
| `/client/src/pages/` | 8 200+ | 0 | **0 %** 🔴 |
| `/client/src/components/` | 4 500+ | 0 | **0 %** 🔴 |
| `/server/lib/` | 5 159 | 186 | **3,6 %** 🔴 |
| `/server/routes/` | 6 200+ | 0 | **0 %** 🔴 |
| `/server/` (root) | 3 100 | 0 | **0 %** 🔴 |
| **TOTAL** | **37 476** | **1 196** | **3,1 %** 🔴 |

---

## 9. Priorisation

### P0 — Risque régression grave (40-60 h)

1. Tests `import-excel.ts` (parsage + fallback) — corruption données
2. Tests `sync-insee.ts` (indexation) — loyers mal indexés
3. Tests `validation.ts` — bypass validation possible
4. Centraliser logique loyer (32 duplications) — divergence garantie
5. ESLint configuré en CI

### P1 — Dettes techniques (20-30 h)

1. Tests fallback parsers (`parsePatrimoine`, etc.) — formats anciens Excel
2. Tests `crud-factory.ts` complet
3. Tests `compute-taux-capi.ts` — calculs immobiliers
4. Refactor `importBaux()` / `importEmprunts()`
5. `noUncheckedIndexedAccess` dans tsconfig.json
6. Supprimer `playwright-core` non utilisé

### P2 — Polish (10-15 h)

1. Renommer `num()` / `str()` / `id()`
2. Pre-commit hooks (husky)
3. Documenter format Excel attendu
4. Tests E2E pages critiques

---

## 10. Forces constatées

- `am-calculations.ts` excellemment testé (93 cas)
- TypeScript `strict: true` activé
- Aucune dépendance obsolète
- Commentaires métier complets
- Schéma Drizzle bien structuré
- CI pipeline minimal mais fonctionnel
