# Checklist Développeurs — Corrections Audit Métier

## P1 — À corriger en priorité (6 items)

### [ ] 1. forceManual ignoré sur 15 pages

**Symptôme :** Utilisateur coche "override manuel" → loyer ne change pas en UI

**Fichiers affectés :**
```
GL :
  □ client/src/pages/gestion-locative/Baux.tsx:35-37
  □ client/src/pages/gestion-locative/Dashboard.tsx:51, 99, 107, 110, 413, 417
  □ client/src/pages/gestion-locative/KPI.tsx:34, 53, 61, 64, 91, 117, 384
  □ client/src/pages/gestion-locative/Projections.tsx:66, 125
  □ client/src/pages/gestion-locative/BailDetail.tsx:423, 464, 478
AM :
  □ client/src/pages/asset-management/ActifDetail.tsx:131
  □ client/src/pages/asset-management/Dashboard.tsx:652, 697
  □ client/src/pages/asset-management/Lots.tsx:38
  □ client/src/pages/asset-management/VuePatrimoine.tsx:119, 184, 213
```

**Fix :**
```typescript
// Avant (MAUVAIS)
Number(r.loyerHTActu || r.loyerBaseHT || 0)

// Après (CORRECT)
import { getBailLoyerAnnuel } from '../../lib/am-calculations';
getBailLoyerAnnuel(bail)
```

**Test :**
1. Créer bail avec loyerBaseHT=1000
2. Coche forceManual=true, loyerManuelOverride=1500
3. Vérifier affichage = 1500 (pas 1000)

---

### [ ] 2. Statut "résilié" non normalisé

**Symptôme :** Baux avec statut="resilie" (sans accent) ne sont pas filtrés

**Fichier principal :** `client/src/lib/am-calculations.ts:138`

**Fix :**
```typescript
// Ajouter fonction (comme normLoue)
const normResilie = (s: string | null | undefined) =>
  s?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "resilie";

// Utiliser partout
.filter((b) => !normResilie(b.statut) && !b.archived)
```

**Vérification base :**
```sql
SELECT COUNT(DISTINCT statut) FROM gl_baux;
-- Devrait être 3-4 max (actif, expiré, résilié, vacant?)
```

---

### [ ] 3. Refuser loyer base vide en import-excel.ts

**Symptôme :** Loyer budgété remplace signature immuable

**Fichier :** `server/import-excel.ts:1146-1147`

**Fix :**
```typescript
// Avant (MAUVAIS — fallback implicite)
const loyerBaseHT = b.loyerAnnuelDepart || loyerActuel;

// Après (CORRECT — exiger base)
if (!b.loyerAnnuelDepart) {
  logger.warn(`SKIP: bail ${b.locataire} — loyer base manquant`);
  continue; // Ignorer ce bail
}
const loyerBaseHT = b.loyerAnnuelDepart;
const loyerHTActu = loyerActuel || b.loyerAnnuelDepart; // OK fallback pour actu
```

**Test :** Import Excel sans colonne "Loyer annuel de départ" → doit sauter ces baux

---

### [ ] 4. Normaliser format trimestre en import

**Symptôme :** Trimestres "T1 2024" (espace) vs "T1-2024" (tiret) → incompatibles

**Fichier :** `server/import-excel.ts`

**Fix :**
```typescript
// Ajouter fonction normalization
function normalizeQuarter(raw: string | null): string | null {
  if (!raw) return null;
  // "T1 2024" | "T1-2024" | "2T2024" | "2024-T1" → "T1-2024"
  const m = raw.match(/T?(\d)-?(\d{4})/i) || raw.match(/(\d)-?T-?(\d{4})/i);
  if (m) return `T${m[1]}-${m[2]}`;
  return null;
}

// Utiliser sur tous les trimestreRef
row.trimestreRef = normalizeQuarter(xlsxValue);
```

**Test :** Importer 3 baux avec formats trimestres différents → tous doivent être "T1-2024"

---

### [ ] 5. Implémenter franchises GL

**Symptôme :** Table gl_baux_franchises existe, zéro code pour appliquer

**Fichiers à créer/modifier :**

1. **Endpoint API** : `server/routes/gl.ts`
   ```typescript
   // GET /api/gl/baux/:bailId/franchises
   // POST /api/gl/baux/:bailId/franchises
   // DELETE /api/gl/franchises/:franchiseId
   ```

2. **Helper** : `client/src/lib/gl-calculations.ts`
   ```typescript
   export function getLoyerNetFranchises(bail: BailGL, annee: number): number {
     // Récupérer franchises actives pendant annee
     // Déduire du loyer brut
     // Retourner loyer net
   }
   ```

3. **UI** : `client/src/pages/gestion-locative/BailDetail.tsx`
   - Ajouter section "Franchises"
   - Modal ajout/édition franchise
   - Tableau historique franchises

4. **Affichage** : `client/src/pages/gestion-locative/Baux.tsx`
   - Colonne "Loyer net" = brut - franchises actives

---

### [ ] 6. TVA — ajouter historique + snapshot

**Symptôme :** Changement TVA 20% → 5.5% → TTC valide invalide

**Fichiers :**

1. **Schema** : `shared/schema.ts`
   ```typescript
   bauxGL : {
     // Existant
     tvaTaux: numeric("tva_taux"),  // 20, 5.5, etc
     // Ajouter
     loyerTTCSnapshot: numeric("loyer_ttc_snapshot"),  // Cache au moment signature
   }
   ```

2. **Migration** : Calculer snapshot rétro pour tous les baux

3. **Validation** : Dans `server/routes/gl.ts`
   ```typescript
   if (bail.taxe === "TVA" && (!bail.tvaTaux || bail.tvaTaux < 0)) {
     throw new Error("Taux TVA requis pour régime TVA");
   }
   ```

---

## P2 — À clarifier (3 items)

### [ ] 7. Charges locatives — clarifier modèle

**Action :** Mettre à jour REGLES_METIER.md section 2 & 12

```markdown
### Clarification : deux niveaux de charges

- **Charges locatives** (GL bail) = charges refacturables au locataire
  - Champ `bail.charges` (mensuel)
  - Stocke : électricité commune, entretien, provision régularisation
  - Calculé pour KPI : charges/berceau = (charges × 12) / capacite

- **Charges copropriété** (AM actif) = charges immobilière
  - Champ `actif.chargesCopropriete`
  - Stocke : syndic, assurance PNO, taxe foncière (optionnel)
  - Utilisé pour NOI AM
```

---

### [ ] 8. Emprunts SCI — documenter allocation

**Action :** Ajouter section REGLES_METIER

```markdown
### Allocation emprunts SCI sur multi-actifs

Si une SCI a N actifs et emprunts SCI (sans actifId spécifique) :
CRD par actif = CRD_sci / N

Hypothèse : Allocation égale (pas pondérée par valorisation/loyer).

Si besoin pondération : documenter + implémenter.
```

---

### [ ] 9. Lots — clarifier filtrage

**Action :** Ajouter commentaire `client/src/lib/am-calculations.ts:74`

```typescript
// Lots ne sont jamais filtrés par statut (contrairement aux baux)
// Raison : un lot porte le parc physique (immobilier), pas le revenu locatif.
// Le loyer vit sur le bail, pas sur le lot.
// Un lot sans bail = vacant (zéro loyer), mais existe toujours physiquement.
const actifLots = allLots.filter((l: any) => 
  l.actifId === actif.id && !l.archived
  // Pas de filtre statut intentionnel
);
```

---

## Épic de travail suggéré

### Sprint 1 — Urgent (3-4j)
- [ ] 1. forceManual (15 pages)
- [ ] 2. normResilie (normalisation)
- [ ] 3. import-excel refuser loyer base vide

### Sprint 2 — Haute (5-7j)
- [ ] 4. Format trimestre normalisation + migration
- [ ] 5. Franchises (endpoint + UI)
- [ ] 7. Charges — clarifier doc

### Sprint 3 — Moyen (4-5j)
- [ ] 6. TVA snapshot + validation
- [ ] 8. Emprunts — documenter allocation
- [ ] 9. Lots — clarifier commentaire

---

## Testing checklist

- [ ] `npm test` passe (all)
- [ ] forceManual : créer bail override → vérifie 15 pages
- [ ] normResilie : baux "resilie" vs "résilié" → tous filtrés
- [ ] import : loyer base vide → SKIP log
- [ ] trimestre : 3 formats différents → tous "T1-2024"
- [ ] franchises : créer franchise → déduction en UI
- [ ] TVA : change taux → snapshot préservé

---

## Rollout

1. Merge après tests complets
2. QA vérifie sur preprod chaque P1
3. Deploy en prod semaine du 27 avril

