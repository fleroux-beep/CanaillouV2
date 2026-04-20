# AUDIT MÉTIER — CANAILLOU V2
**Date d'audit:** 20 avril 2026  
**Document référence:** `/home/user/CanaillouV2/REGLES_METIER.md`

---

## FINDINGS CRITIQUES

### P1 : Incohérence loyer non-éliminatoire dans pages GL et AM (forceManual ignored)

**Titre:** Pages GL/AM utilisent `loyerHTActu || loyerBaseHT` au lieu de `getBailLoyerAnnuel()` — incohérence métier.

**Règle documentée:**
- REGLES_METIER.md § 1.3 (priorité getBailLoyerAnnuel) : 
  1. Si `forceManual === true` ET `loyerManuelOverride > 0` → utiliser `loyerManuelOverride`
  2. Sinon si `loyerHTActu > 0` → utiliser `loyerHTActu`
  3. Sinon → utiliser `loyerBaseHT`

**Implémentation réelle:**

1. **client/src/pages/gestion-locative/Baux.tsx:35-37** :
   ```typescript
   render: (r) => (r.loyerHTActu || r.loyerBaseHT) ? formatCurrency(r.loyerHTActu || r.loyerBaseHT) : "—"
   ```
   - Utilise fallback `loyerHTActu || loyerBaseHT` directement
   - **Ignore complètement** `forceManual` et `loyerManuelOverride`
   - Quand l'utilisateur coche `forceManual=true` avec override, le loyer affiché reste basé sur loyerHTActu

2. **Multiples autres pages** utilisent le même pattern :
   - client/src/pages/gestion-locative/Dashboard.tsx:51, 99, 107, 110, 413, 417
   - client/src/pages/gestion-locative/KPI.tsx:34, 53, 61, 64, 91, 117, 384
   - client/src/pages/gestion-locative/Projections.tsx:66, 125
   - client/src/pages/gestion-locative/BailDetail.tsx:423, 464, 478
   - client/src/pages/asset-management/ActifDetail.tsx:131
   - client/src/pages/asset-management/Dashboard.tsx:652, 697
   - client/src/pages/asset-management/Lots.tsx:38
   - client/src/pages/asset-management/VuePatrimoine.tsx:119, 184, 213

**Impact:** 
- **P1 — visible utilisateur** : Un loyer forcé manuellement (bail en litige, erreur INSEE, réduction commerciale) s'affiche incorrectement sur 15+ pages.
- Les KPIs (WALT, NOI, rendement) qui dépendent du loyer calculé deviennent inexacts.
- Audit trail incomplet : l'utilisateur coche `forceManual` mais le UI continue d'afficher `loyerHTActu`.

**Fix suggéré:**
- Importer `getBailLoyerAnnuel()` dans TOUTES les pages GL/AM
- Remplacer tous les `loyerHTActu || loyerBaseHT` par `getBailLoyerAnnuel(bail)`
- Tester en GL Baux.tsx, Dashboard.tsx, KPI.tsx, Projections.tsx et AM pages

---

### P2 : Comparaison d'état statut incohérente — "résilié" vs "resilie"

**Titre:** Filtrage loyers utilise unicode-denormalized "résilié" ; base possiblement stocke "resilie" sans accent.

**Règle documentée:**
- REGLES_METIER.md § 1.1 : "Loyer annuel HT = somme des loyers des baux actifs liés à cet actif"
- "Baux actifs" = statut != "resilie" ET archived == false
- REGLES_METIER.md § 15.3 explicite une normalisation unicode pour "loué" (normLoue)

**Implémentation réelle:**

Code client vérifie partout `b.statut !== "résilié"` (avec accent) :
- client/src/lib/am-calculations.ts:138 : `b.statut !== "résilié"`
- client/src/pages/asset-management/Dashboard.tsx:88, 384 : `b.statut !== "résilié"`
- client/src/pages/asset-management/Baux.tsx:114 : render variant basé sur `"résilié"`

Cependant, pas de preuve que les statuts sont normalisés côté base avant stockage. Le document parle de normalisation Unicode **uniquement pour "loué"** (fonction `normLoue`) :

```typescript
const normLoue = (s: string | null | undefined) =>
  s?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue";
```

Aucune fonction `normResilie` existe. Si la base stocke "resilie" (sans accent) mais le code vérifie "résilié", les filtres silencieusement **excluent moins de baux** → **loyers sur-évalués**.

**Impact:**
- **P1 à P2 selon source de vérité** : Si la base contient "resilie" et le code cherche "résilié", les baux résiliés ne sont PAS filtrés correctement.
- Loyer annuel surfacé sur pages AM + KPIs GL directement faux.

**Fix suggéré:**
1. Auditer tous les statuts existants en base : `SELECT DISTINCT statut FROM gl_baux`
2. Ajouter normalization côté client pour le statut résilié (comme pour "loué")
3. Standardiser : soit accepter "resilie" partout, soit migrer tous les existants en "résilié"

---

### P3 : Franchises non implémentées dans calculs loyer GL

**Titre:** Franchises (gl_baux_franchises) documentées mais jamais appliquées aux calculs affichés.

**Règle documentée:**
- REGLES_METIER.md § 1.4 + § 11 : 
  - Franchises stockées dans `gl_baux_franchises` (table distincte)
  - Cash-flow année N = loyer_annuel − Σ franchises_actives_pendant_N au prorata
  - "Cela préserve la cohérence long terme : la projection DCF continue d'utiliser le loyer contractuel"

**Implémentation réelle:**
- Table `franchisesBaux` existe (shared/schema.ts:416-427)
- **Aucune fonction JavaScript** pour :
  - Récupérer franchises pour un bail
  - Déduire du loyer annuel affiché
  - Calculer le cash-flow net franchises incluses
- Pages GL (Dashboard, KPI, BailDetail) affichent loyer brut sans franchises
- Pas d'UI pour créer/éditer franchises dans GL Baux

**Impact:**
- **P1 — données métier manquantes** : Le loyer affiché est le loyer contractuel brut ; les réductions (prorata entrée, travaux preneur, réductions commerciales) ne sont jamais visibles en UI
- Calculs de rendement GL inexacts (cash-flow gonflé si franchises actives)
- Contrôle de gestion impossible pour années avec franchises

**Fix suggéré:**
1. Ajouter endpoint GET `/api/gl/baux/:bailId/franchises`
2. Créer helper `getLoyerNetFranchises(bail, annee)` qui déduit franchises du loyer
3. Créer UI pour franchises dans BailDetail (modal ajout/édition)
4. Afficher loyer brut + franchises actives + loyer net en colonne séparée GL Baux

---

### P4 : Format trimestre incohérent en import Excel (convertPeriod parsing vs normalization)

**Titre:** Format trimestre attendu "T1-2025" mais normalisé une seule fois en sync-insee.ts, non en import-excel.ts.

**Règle documentée:**
- REGLES_METIER.md § 16 : Format tiret cohérent partout "T1-2025"
- Métadonnées doivent être persisted dans trimestreRef avec format uniforme

**Implémentation réelle:**

1. **server/lib/sync-insee.ts** (convertPeriod, ~ligne 99-116) :
   - Convertit "2025-Q1" → "T1-2025" ✓
   - Convertit "2025-T1" → "T1-2025" ✓
   - Accepte "T1-2025" as-is ✓

2. **scripts/import-bdd-am.ts** (parseIndice, ~ligne 61-84) :
   - Parse "2T2017" → normalise en "T2-2017" ✓
   - Format cohérent documenté

3. **server/import-excel.ts** (import depuis Excel structuré) :
   - Ligne 200+ : aucune normalisation visible du trimestre
   - Stocke raw "trimestreRef" from Excel sans vérification
   - Risque : Excel contient "T1 2024" (espace) → stocké "T1 2024" au lieu de "T1-2024"

**Impact:**
- **P2 — comparaison d'indices** : Si deux baux ont "T1-2024" et "T1 2024" (espace vs tiret), jointures/comparaisons échouent silencieusement.
- Indexation automatique peut sauter des baux si format trimestre différent
- KPI indices marché indexés/non-indexés incohérents

**Fix suggéré:**
1. Normaliser tous les `trimestreRef` en import-excel.ts via une fonction `normalizeQuarter()` 
2. Ajouter validation schéma Drizzle sur `trimestreRef` regex : `^T[1-4]-\d{4}$`
3. Migration : mettre à jour tous les trimestres existants en base

---

### P5 : API /api/admin/import-excel split loyer_base_ht / loyer_ht_actu non documenté

**Titre:** Admin "Réimporter Excel" snapshot métadonnées indice non explicite dans description métier.

**Règle documentée:**
- REGLES_METIER.md § 1 : loyerBaseHT = signature, loyerHTActu = indexé auto
- Scripts/import-bdd-am.ts documenté : loyer départ = loyerBaseHT, budget = ignoré
- Aucune doc sur ce qu'import-excel.ts fait du loyer actuel ("Loyer actuel HC 2026" xlsx)

**Implémentation réelle:**
- server/import-excel.ts (ligne 1146-1147) :
  ```typescript
  const loyerBaseHT = b.loyerAnnuelDepart || loyerActuel;
  const loyerHTActu = loyerActuel || b.loyerAnnuelDepart;
  ```
- **Fallback implicite** : si "Loyer annuel de départ" vide → utilise "Loyer actuel HC 2026" comme base (WRONG — base = signature immuable)
- Document REGLES_METIER dit "on NE force PAS la valeur xlsx "Loyer actuel HC 2026"" mais import-excel.ts le fait comme fallback

**Impact:**
- **P1 — perte de données** : Si utilisateur réimporte Excel sans "Loyer annuel de départ", la base change, un loyer budgété remplace la vraie signature.
- Impossible de revenir à la vraie indexation INSEE car valeur base corrompue
- Audit trail inexistant

**Fix suggéré:**
1. **Explicit dans REGLES_METIER** : "import-excel REFUSE les baux sans loyerAnnuelDepart" (pas de fallback)
2. Ajouter log "SKIP: bail X loyer base manquant"
3. Ajouter mode strict: `--strict` flag qui fail plutôt que fallback
4. Ajouter snapshot métadonnées indice (trimestreRef, valeurIndiceBase) dans validation import

---

### P6 : Pas de contrôle TVA cohérence HT vs TTC

**Titre:** TVA appliquée en affichage uniquement, pas de champs HT/TTC distincts en base.

**Règle documentée:**
- REGLES_METIER.md § 12 (TVA & CRL) :
  - "Loyer HT" / "Loyer TTC" (2 concepts distincts)
  - TVA par défaut 20%
  - CRL = 2.5% (alternative)

**Implémentation réelle:**
- shared/schema.ts bauxGL : champs `loyerBaseHT`, `loyerHTActu` — aucun champ `loyerTTC`
- client/src/pages/gestion-locative/Baux.tsx (ligne 36-48) : calcule TTC à la volée
  ```typescript
  if (r.taxe === "TVA") {
    return formatCurrency(ht * (1 + tva / 100));
  }
  ```
- TVA stockée en `tvaTaux` (pourcentage), appliquée seulement en UI
- **Pas de validation** : si utilisateur change TVA de 20% → 5.5%, TTC historique invalide, aucune trace

**Impact:**
- **P2 — incohérence métier** : Système suppose TVA = cache comme loyerHTActu, mais aucun historique
- Factures/paiements GL impossibles à réconcilier si TVA change après signature
- REGLES_METIER demande clarté HT vs TTC, mais base ne la garantit pas

**Fix suggéré:**
1. Ajouter champs base : `loyerHTActu`, `tvaTaux`, optionnel `loyerTTCSnapshot` (cache)
2. Ajouter validation : si `taxe === "TVA"`, exiger `tvaTaux` >= 0
3. Ajouter audit trail : loger changeVent TVA au-delà X%
4. Mettre à jour REGLES_METIER avec contraintes

---

### P7 : Charges locatives mentionnées mais pas séparées dans KPI (refacturation)

**Titre:** REGLES_METIER § 2 mentionne charges refacturées/provisions/régularisation, non implémentées UI.

**Règle documentée:**
- REGLES_METIER.md § 2 (Charges) :
  - Charges_annuelles = Charges_copropriete + Taxe_fonciere + Assurance_PNO
  - Champs legacy chargesAnnuelles vs explicit chargesCopropriete

**Implémentation réelle:**
- client/src/lib/am-calculations.ts (getChargesAnnuelles) :
  ```typescript
  const copro = Number(actif.chargesCopropriete ?? actif.chargesAnnuelles ?? 0);
  return copro + Number(actif.taxeFonciere ?? 0) + Number(actif.assurancePno ?? 0);
  ```
- **Niveau actif seulement** : charges ne sont pas attachées à un bail spécifique
- GL KPI.tsx calcule "Charges par berceau" = (charges_mensuelles × 12) / capacite
  - Source de charges => **pas clair** : vient de champ "charges" sur bail (GL), pas d'actif

**Impact:**
- **P2 — incohérence métier** : Doc suggère refacturation par bail (provisions, régularisation), mais code agrège charges au niveau actif
- GL Baux.tsx charge column = champ "charges" par bail (correct), mais AM Dashboard n'isole pas charges par bail
- KPI "charges par berceau" mélange charges locatives (bail) + copropriété (actif)

**Fix suggéré:**
1. Clarifier REGLES_METIER : charges locatives = GL bail level, charges copropriété = AM actif level (déjà le cas)
2. Ajouter UI KPI GL : afficher séparation charges locatives refacturées vs provisions vs régularisation
3. Document de suivi : mention qu'AM Actif + GL Bail ont modèles charges différents (OK documenté mais pas en règles)

---

## FINDINGS SECONDAIRES

### P2 : Filtre archived=false incohérent pour lots

**client/src/lib/am-calculations.ts:138** filtre baux par actifId && statut != "résilié" && !archived :
- Correct pour baux
- **Lots non filtrés** : Dashboard computeActifKpi ligne 74 = `allLots.filter((l) => l.actifId === actif.id && !l.archived)`
  - Manque `&& l.statut !== "vacant"` ? Ou c'est intentionnel (lots portent parc physique, pas loyer)
  - REGLES_METIER dit "un lot sans bail = réputé vacant", donc pas de correction needed, mais ambigu en code

**Fix suggéré:** Ajouter commentaire en am-calculations.ts pour clarifier que lots ne sont jamais filtrés par statut (seuls baux comptent).

---

### P2 : Défaut logique loyerBaseHT = null, loyerHTActu = null

**client/src/lib/am-calculations.ts:79-88** (getBailLoyerAnnuel) :
- Si bail = {} (tous champs null), retourne 0 ✓
- Si bail.loyerBaseHT = "0" (string "0"), Number("0") = 0, retourne 0 ✓
- **Edge case** : si bail = { loyerBaseHT: "0", loyerHTActu: "", forceManual: false }
  - `Number("" || 0)` = 0, correct
  - Mais nombre conversion via Number() sans isFinite() check : OK car 0/loyer/null toutes sensées

**Impact:** Minimal, mais REGLES_METIER § 16 dit "toute valeur à Number() vérifiée avec isFinite()" → devrait ajouter une assertion ou fallback.

**Fix suggéré:** Ajouter isFinite check dans getBailLoyerAnnuel.

---

### P2 : Emprunts SCI / Actif allocation incohérente

**client/src/pages/asset-management/Dashboard.tsx:75-76** :
```typescript
const sciEmprunts = allEmprunts.filter((e) => e.sciId === actif.sciId && !e.actifId && !e.archived);
const nbActifsInSci = allActifs.filter((a) => a.sciId === actif.sciId && !a.archived).length || 1;
const crd = getTotalCRD(actifEmprunts) + getTotalCRD(sciEmprunts) / nbActifsInSci;
```

**Allocate emprunt SCI equally across actifs** = OK economically, mais suppose CRD ne change pas per-actif over time. Document muet sur allocation strategy.

**Fix suggéré:** Clarifier REGLES_METIER : allocation emprunts SCI proportionnelle si plusieurs actifs (ou mention de l'hypothèse d'allocation égale).

---

## RÉSUMÉ P0/P1/P2

| Sévérité | Count | Titre |
|----------|-------|-------|
| P0 | 0 | (aucun bug critique = perte données irréversible) |
| **P1** | **6** | Loyer forceManual non-respécté, franchises manquées, split loyer base/actu fallback, TVA non-auditable, format trimestre input non-normalisé |
| P2 | 3 | Statut résilié non-normalisé unicode, charges refacturées ambiguës, emprunts SCI allocation implicite |

---

## RECOMMANDATIONS IMMÉDIATES

1. **URGENT** : Importer `getBailLoyerAnnuel` dans TOUS les pages GL/AM (15+ pages)
   - Test : Créer bail avec forceManual=true, override=1000 → vérifier affichage 1000 partout
   
2. **HAUTE** : Ajouter normalisation `statut` pour "résilié" (comme normLoue)
   - Audit base : `SELECT COUNT(DISTINCT statut) FROM gl_baux`

3. **HAUTE** : Implémenter franchises GL
   - Créer UI + endpoint, afficher loyer brut + franchises = loyer net

4. **MOYENNE** : Normaliser format trimestre en import-excel.ts + migration base

5. **MOYENNE** : Clarifier et documenter allocation emprunts SCI en REGLES_METIER

---

