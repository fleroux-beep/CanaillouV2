# Regles Metier — Source de Verite

> Document de reference pour tous les calculs, formules et regles metier de CanaillouV2.
> Chaque audit doit verifier le code **contre ce document**.
> Derniere mise a jour : 2026-03-20

---

## Table des matieres

1. [Asset Management — Loyers](#1-asset-management--loyers)
2. [Asset Management — Charges](#2-asset-management--charges)
3. [Asset Management — Valorisation](#3-asset-management--valorisation)
4. [Asset Management — Emprunts & Amortissement](#4-asset-management--emprunts--amortissement)
5. [Asset Management — Rendements](#5-asset-management--rendements)
6. [Asset Management — Ratios financiers](#6-asset-management--ratios-financiers)
7. [Asset Management — TRI / VAN / DCF](#7-asset-management--tri--van--dcf)
8. [Asset Management — Stress Tests](#8-asset-management--stress-tests)
9. [Asset Management — Projections](#9-asset-management--projections)
10. [Asset Management — NAV par associe](#10-asset-management--nav-par-associe)
11. [Gestion Locative — Loyers & Indexation](#11-gestion-locative--loyers--indexation)
12. [Gestion Locative — TVA & CRL](#12-gestion-locative--tva--crl)
13. [Gestion Locative — KPI specifiques creches](#13-gestion-locative--kpi-specifiques-creches)
14. [Gestion Locative — WALT](#14-gestion-locative--walt)
15. [Regles de filtrage & statuts](#15-regles-de-filtrage--statuts)
16. [Regles de formatage](#16-regles-de-formatage)

---

## 1. Asset Management — Loyers

### Loyer annuel d'un actif

```
Loyer_annuel_actif = Somme des loyers des baux actifs lies a cet actif
```

**Regles :**
- Ne compter que les baux avec `statut != "resilie"` et `archived == false`
- **Pas de fallback lot** : les lots ne portent plus de loyer. Un lot sans bail actif contribue pour 0.
- Le loyer mensuel d'affichage est toujours calcule a la volee : `loyer_annuel / 12`

### Modele loyer durable : trois colonnes, trois niveaux

Chaque bail (`gl_baux`, scope `am` ou `gl`) porte trois champs loyer distincts :

| Champ | Role | Qui ecrit ? |
|---|---|---|
| `loyerBaseHT` | Loyer annuel HT **a la signature**. Immuable apres creation, sauf avenant formel de renegociation. | Utilisateur (UI Baux, avenants) |
| `loyerHTActu` | Loyer annuel HT **courant** apres indexation INSEE automatique. Cache recalcule = `loyerBaseHT x (indice_nouveau / valeurIndiceBase)`. | Cron INSEE uniquement |
| `loyerManuelOverride` | Valeur forcee ponctuellement par l'utilisateur. **Ignoree** tant que `forceManual = false`. | Utilisateur via toggle explicite |

### Priorite de lecture (getBailLoyerAnnuel)

```
1. Si forceManual == true ET loyerManuelOverride > 0  → loyerManuelOverride
2. Sinon si loyerHTActu > 0                           → loyerHTActu
3. Sinon                                              → loyerBaseHT
```

**Fichier source :** `client/src/lib/am-calculations.ts` — `getBailLoyerAnnuel()`
**Indexation :** `server/lib/sync-insee.ts` — `autoIndexBaux()` (ignore `forceManual == true`)

### forceManual : desactive par defaut

- Par defaut (`forceManual = false`), la chaine `loyerBaseHT` → INSEE → `loyerHTActu` fait foi. L'indexation auto tourne sans intervention.
- Cocher `forceManual` coupe cette chaine pour le bail concerne. A reserver a :
  - renegociation ponctuelle non formalisee par avenant,
  - reduction commerciale temporaire,
  - erreur ou incoherence INSEE detectee,
  - litige en cours.
- **Decocher `forceManual` = retour automatique a l'indexation base x indice.** Aucune donnee n'est perdue : `loyerBaseHT` reste la source canonique.

### Franchises et prorata : modele separe

Les franchises de loyer (rent-free), prorata temporels et reductions exceptionnelles ne modifient **jamais** `loyerBaseHT` / `loyerHTActu`. Elles sont stockees dans `gl_baux_franchises` :

| Champ | Description |
|---|---|
| `bailId` | FK `gl_baux.id`, cascade delete |
| `dateDebut`, `dateFin` | Periode couverte par la franchise |
| `montant` | Montant total en EUR sur la periode (negatif = reduction) |
| `motif` | "franchise commerciale", "prorata entree", "travaux preneur"… |

Le cash-flow de l'annee N = `loyer_annuel_actif(bail) − Σ franchises actives pendant N, au prorata des jours couverts par l'annee`. Cela preserve la coherence long terme : la projection DCF continue d'utiliser le loyer contractuel, et les franchises ne polluent que l'annee concernee.

---

## 2. Asset Management — Charges

### Charges annuelles d'un actif

```
Charges_annuelles = Charges_copropriete + Taxe_fonciere + Assurance_PNO
```

**Regles :**
- `Charges_copropriete` = champ `chargesCopropriete` en priorite, sinon `chargesAnnuelles` (champ legacy)
- Les 3 composantes sont **annuelles** (pas besoin de multiplier par 12)
- Si un champ est null/vide → valeur = 0

**Fichier source :** `client/src/lib/am-calculations.ts` — `getChargesAnnuelles()`

---

## 3. Asset Management — Valorisation

### Prix d'acquisition total

```
Prix_acquisition_total = Prix_achat + Frais_notaire + Frais_agence + Montant_travaux
```

### Valeur estimee

Deux methodes, puis mediane :

**Methode capitalisation :**
```
Valeur_capi = NOI / (Taux_capitalisation / 100)
  avec NOI = Loyer_annuel - Charges_annuelles
  Condition : NOI > 0 ET Taux_capi > 0
```

**Methode comparables :**
```
Valeur_comp = Surface_Carrez * Prix_m2_marche
  Surface utilisee : surfaceCarrez en priorite, sinon surface
  Condition : surface > 0 ET prix_m2 > 0
```

**Mediane :**
- Si les 2 methodes sont disponibles : `(Valeur_capi + Valeur_comp) / 2`
- Si une seule est disponible : cette valeur
- Si aucune : `Prix_acquisition_total` (fallback)

**Fichier source :** `client/src/lib/am-calculations.ts` — `getValeurEstimee()`

---

## 4. Asset Management — Emprunts & Amortissement

### Mensualite (calcul actuariel avec interets composes mensuels)

```
r = Taux_annuel / 100 / 12        (taux mensuel)
n = Duree_ans * 12                  (nombre de mois)
Mensualite = Montant * [r * (1+r)^n] / [(1+r)^n - 1]
```

**Cas particuliers :**
- Si `mensualite` est renseignee en base → l'utiliser directement
- Si `taux_annuel == 0` → amortissement lineaire : `Montant / (Duree * 12)`

### Annuite

```
Annuite = Mensualite * 12
```

### Service de la dette

```
Service_dette = Somme des annuites de tous les emprunts actifs
```

### Capital restant du (CRD)

```
CRD = capitalRestantDu si renseigne, sinon montantEmprunte
```

### Tableau d'amortissement

Pour chaque annee y (de 1 a duree) :
```
Interets_annee = Capital_debut * Taux_annuel_decimal
  avec Taux_annuel_decimal = taux_annuel / 100
Capital_amorti = min(Capital_debut, Annuite - Interets_annee)
Capital_fin = max(0, Capital_debut - Capital_amorti)
Assurance_annuelle = Assurance_mensuelle * 12
Total_annuel = Annuite_effective + Assurance_annuelle
```

> **NOTE :** Le tableau d'amortissement utilise un pas annuel par simplification.
> Pour un tableau au mois pres, il faudrait iterer mois par mois.

**Fichier source :** `client/src/lib/am-calculations.ts` — `getAnnuiteEmprunt()`, `computeAmortSchedule()`

---

## 5. Asset Management — Rendements

### NOI (Net Operating Income)

```
NOI = Loyers_annuels - Charges_annuelles
```

### Rendement brut

```
Rendement_brut = (Loyers_annuels / Prix_acquisition) * 100
```

> Denominateur = **prix d'acquisition total** (même base que le rendement net).

### Rendement net

```
Rendement_net = ((Loyers_annuels - Charges_annuelles) / Prix_acquisition) * 100
```

### Cash-flow net

```
Cash_flow_net = NOI - Service_dette
```

### Fonds propres nets

```
Fonds_propres = Valorisation - CRD_total
```

**Fichier source :** `client/src/lib/am-calculations.ts` — `getRendementBrut()`, `getRendementNet()`

---

## 6. Asset Management — Ratios financiers

### LTV (Loan-to-Value)

```
LTV = (CRD / Valorisation) * 100
```

**Seuils d'alerte :**
- < 60% → Vert (confortable)
- 60-80% → Orange (vigilance)
- > 80% → Rouge (critique)

### DSCR (Debt Service Coverage Ratio)

```
DSCR = NOI / Service_dette
```

**Seuils :**
- >= 1.5x → Vert (confortable)
- 1.2x - 1.5x → Orange
- 1.0x - 1.2x → Ambre
- < 1.0x → Rouge (defaut de couverture)

### Distribution Yield

```
Distribution_yield = (Cash_flow_net / Fonds_propres) * 100
```

### Equity Multiple

```
Equity_multiple = Fonds_propres / Prix_acquisition_total
```

**Fichier source :** `client/src/lib/am-calculations.ts` — `getLTV()`, `getDSCR()`

---

## 7. Asset Management — TRI / VAN / DCF

### TRI (Taux de Rendement Interne)

Methode Newton-Raphson :
```
Trouver r tel que Somme(CF_t / (1+r)^t) = 0  pour t = 0..n
  CF_0 = -Investissement (negatif)
  CF_1..n = Flux annuels
```

**Parametres :** max 100 iterations, tolerance 1e-7, taux initial 10%.

### VAN (Valeur Actuelle Nette)

```
VAN = Somme(CF_t / (1 + taux/100)^t)  pour t = 0..n
```

### DCF (Discounted Cash Flow)

Projection sur N annees avec valeur terminale (Gordon Growth) :
```
CF_y = NOI_actuel * (1 + g)^y          pour y = 1..N
PV_CF = Somme(CF_y / (1 + r)^y)

Valeur_terminale = NOI_(N+1) / (Cap_sortie - g)
  avec NOI_(N+1) = NOI * (1 + g)^(N+1)
  Condition : Cap_sortie > g + 0.001

PV_terminale = Valeur_terminale / (1 + r)^N
Valeur_DCF = PV_CF + PV_terminale
```

**Parametres par defaut :**
- Croissance loyers (g) : 2.5%
- Taux d'actualisation (r) : 6% (WACC)
- Cap rate de sortie : 5.5%
- Horizon : 10 ans

**Fichier source :** `client/src/lib/am-calculations.ts` — `computeIRR()`, `computeNPV()`, `computeDCF()`

---

## 8. Asset Management — Stress Tests

### Scenarios predeterminés

| Scenario      | Vacance | Taux   | Charges |
|---------------|---------|--------|---------|
| Base          | 0%      | +0bp   | +0%     |
| Vacance 10%   | 10%     | +0bp   | +0%     |
| Vacance 20%   | 20%     | +0bp   | +0%     |
| Charges +15%  | 0%      | +0bp   | +15%   |
| Taux +200bp   | 0%      | +200bp | +0%     |
| Stress severe | 15%     | +150bp | +10%   |
| Crise majeure | 25%     | +300bp | +20%   |

### Calculs par scenario

```
Loyer_ajuste = Loyer_base * (1 - Vacance / 100)
Charges_ajustees = Charges_base * (1 + Variation_charges / 100)
NOI_ajuste = Loyer_ajuste - Charges_ajustees

Service_dette_ajuste :
  - Si variation taux != 0 : recalcul emprunt par emprunt
    Taux_stresse = Taux_base + Variation_taux / 100
    Annuite_stressée = formule actuarielle avec taux stresse
  - Sinon : service de dette normal

Cash_flow_ajuste = NOI_ajuste - Service_dette_ajuste
DSCR_ajuste = NOI_ajuste / Service_dette_ajuste
Rendement_net_ajuste = ((Loyer_ajuste - Charges_ajustees) / Valorisation) * 100
```

**Fichier source :** `client/src/lib/am-calculations.ts` — `computeStressTests()`

---

## 9. Asset Management — Projections

### Projection multi-annees

Pour chaque annee y (de 0 a N) :
```
Loyers_y = Loyers_y-1 * (1 + Croissance / 100)
Charges_y = Charges_y-1 * (1 + Inflation / 100)
Valo_y = Valo_y-1 * (1 + Appreciation / 100)
Dette_y = max(0, Dette_y-1 - Amortissement_annuel)

NOI_y = Loyers_y - Charges_y
Cash_flow_y = NOI_y - Service_dette  (service de dette constant)
Rendement_net_y = NOI_y / Valo_y * 100
DSCR_y = NOI_y / Service_dette
LTV_y = Dette_y / Valo_y * 100
```

**Parametres par defaut :**
- Croissance loyers : 2.5%
- Inflation charges : 2%
- Appreciation actifs : 1.5%
- Horizon : 10 ans
- Amortissement annuel : CRD / 20 (estimation)

**Fichier source :** `client/src/lib/am-calculations.ts` — `computeMultiYearProjection()`

---

## 10. Asset Management — NAV par associe

```
Part_pct = Somme des pourcentages de participation de l'associe
Apport = Somme des montants d'apport de l'associe
NAV_part = NAV_totale * (Part_pct / 100)
Plus_value = NAV_part - Apport
Rendement_annualise = (Loyers_annuels * (Part_pct / 100)) / Apport * 100
```

Avec `NAV_totale = Valorisation - CRD`

**Fichier source :** `client/src/lib/am-calculations.ts` — `computeAssocieNAV()`

---

## 11. Gestion Locative — Loyers & Indexation

### Structure du loyer GL

Cf. section 1 — le modele a trois niveaux (`loyerBaseHT`, `loyerHTActu`,
`loyerManuelOverride` + `forceManual`) s'applique identiquement aux scopes `am`
et `gl` sur la meme table `gl_baux`. Les franchises vivent dans
`gl_baux_franchises`, partagees entre les deux interfaces.

- `loyerBaseHT` : loyer initial a la signature du bail (**annuel HT EUR**)
- `loyerHTActu` : loyer courant apres indexation INSEE auto (**cache**)
- `loyerManuelOverride` : override manuel ponctuel (nul par defaut)
- Le loyer affiche = cf. priorite `getBailLoyerAnnuel` en section 1
- Loyer mensuel = loyer annuel / 12

### Indexation automatique

```
Nouveau_loyer = Loyer_base_HT * (Indice_nouveau / Indice_base)
Taux_variation = ((Indice_nouveau - Indice_base) / Indice_base) * 100
```

**Regles :**
- L'indexation part toujours du **loyer de base** (pas du loyer actuel) — conforme au droit francais
- Exclure les baux avec `forceManual == true`
- Exclure les baux sans `indiceReference`, `valeurIndiceBase` ou `loyerBaseHT`
- **Idempotence** : ne pas re-indexer si l'indice est deja applique
- Apres indexation, mettre a jour `loyerHTActu` sur le bail

### Indices supportes

- **ILC** : Indice des Loyers Commerciaux (baux commerciaux)
- **IRL** : Indice de Reference des Loyers (habitation)
- **ILAT** : Indice des Loyers des Activites Tertiaires (bureaux)
- **ICC** : Indice du Cout de la Construction (ancien, peu utilise)

**Fichier source :** `server/routes/gl.ts` — `/api/gl/indexation/auto`

---

## 12. Gestion Locative — TVA & CRL

### Loyer TTC

```
Si taxe == "TVA" :
  Loyer_TTC = Loyer_HT * (1 + Taux_TVA / 100)
  Taux_TVA par defaut : 20%

Si taxe == "CRL" :
  CRL = Loyer_HT * 2.5%  (Contribution sur les Revenus Locatifs)
  Le loyer affiché reste le HT, avec mention "(CRL)"

Si aucune taxe :
  Loyer_TTC = Loyer_HT
```

**Fichier source :** `client/src/pages/gestion-locative/Baux.tsx` — colonne `loyerTTC`

---

## 13. Gestion Locative — KPI specifiques creches

### Indicateurs par berceau

```
Loyer_par_berceau = Loyer_HT_total / Capacite_totale
Surface_par_berceau = Surface_totale / Capacite_totale
Charges_par_berceau = (Charges_mensuelles * 12) / Capacite_totale
Cout_locatif_par_berceau = (Loyer_HT + Charges * 12) / Capacite_totale
Cout_total_par_berceau = (Loyer_HT + Charges * 12 + Taxe_fonciere) / Capacite_totale
```

### Indicateurs par m2

```
Loyer_par_m2 = Loyer_HT_total / Surface_totale
Charges_par_m2 = (Charges_mensuelles * 12) / Surface_totale
```

**Fichier source :** `client/src/pages/gestion-locative/KPI.tsx`, `Dashboard.tsx`

---

## 14. Gestion Locative — WALT

### Weighted Average Lease Term

```
WALT = Somme(Duree_residuelle_i * Loyer_i) / Somme(Loyers)
  avec Duree_residuelle = max(0, (Date_fin - Aujourd'hui) en annees)
```

**Seuils :**
- > 5 ans → Vert (confortable)
- 2 - 5 ans → Orange (vigilance)
- < 2 ans → Rouge (renouvellement urgent)

**Fichier source :** `client/src/pages/gestion-locative/KPI.tsx`

---

## 15. Regles de filtrage & statuts

### Filtrage standard

| Entite | Filtre actif/visible |
|--------|---------------------|
| Actifs AM | `archived == false` |
| Lots AM | `archived == false` |
| Baux AM | `archived == false` ET `statut != "resilie"` (pour calcul loyer) |
| Emprunts AM | `archived == false` |
| Baux GL | `archived == false` |
| SCIs | `deletedAt == null` (soft delete) |
| Actifs (API) | `deletedAt == null` (soft delete) |

### Statuts des baux AM
- `actif` : bail en cours
- `expire` : bail arrive a echeance
- `resilie` : bail resilie (exclu des calculs de loyer)

### Statuts des lots
- `loue` : lot occupe
- `vacant` : lot libre

### Taux d'occupation

```
Taux_occupation = (Lots_loues / Total_lots) * 100
  avec normalisation unicode des accents pour la comparaison du statut "loue"
```

---

## 16. Regles de formatage

### Devises
- Format : `fr-FR`, devise EUR
- Precision : 2 decimales
- Exemple : `1 234 567,89 EUR`

### Pourcentages
- Precision : 1 decimale par defaut
- Format : `X.X %` (avec espace avant %)

### Nombres
- Format : `fr-FR`
- Precision : 0 decimale par defaut

### Securite des nombres
- Toute valeur passee a `Number()` est verifiee avec `Number.isFinite()`
- Valeur par defaut si NaN/Infinity : 0

---

## 17. Referentiel de marche — Donnees de marche

### Tables de reference

| Table | Contenu | Sources |
|-------|---------|---------|
| `ref_taux_emprunt` | Taux d'emprunt par type actif et duree | Banque de France (auto), Manuel |
| `ref_valeurs_venales` | Prix/m² vente par code postal et type bien | DVF Etalab (auto), Manuel |
| `ref_valeurs_locatives` | Loyer/m² par code postal et type bien | ANIL Carte des loyers (auto), OLL, Manuel, Interne |
| `ref_taux_capitalisation` | Taux capi par code postal et type bien | Calcule (auto), Manuel, ImmoStat |

### Taux de capitalisation derive (automatique)

```
Taux_capi = (Loyer_m2_annuel / Prix_m2_vente) * 100
  avec Loyer_m2_annuel = Loyer_m2_mensuel_ANIL * 12
  et Prix_m2_vente = Prix_m2_median_DVF
```

**Fourchette :**
```
Taux_capi_bas  = (Loyer_m2_bas * 12)  / Prix_m2_haut * 100  (scenario prudent)
Taux_capi_haut = (Loyer_m2_haut * 12) / Prix_m2_bas * 100   (scenario optimiste)
```

**Score de fiabilite :**
- `haute` : nb transactions DVF >= 30 ET donnee locative presente
- `moyenne` : nb transactions >= 10 OU donnee locative presente
- `faible` : donnees insuffisantes

### Enrichissement de getValeurEstimee()

```
Taux_capi utilise = actif.tauxCapitalisation || ref_taux_capi_marche || 0
Prix_m2 utilise   = actif.prixM2Marche || ref_prix_m2_DVF || 0
```

**Regle de priorite : la donnee saisie sur l'actif prime TOUJOURS sur le referentiel marche.**
Le referentiel sert de fallback et de benchmark de comparaison.

### Comparaison Emprunts vs Marche

```
Diff_bp = (Taux_emprunt - Taux_marche) * 100
  <= -25bp → bon (vert)
  -25 a +25bp → neutre
  +25 a +75bp → attention (orange)
  > +75bp → mauvais (rouge)
```

### Sources de donnees

| Source | API/URL | MAJ | Couverture |
|--------|---------|-----|------------|
| DVF (Etalab/DGFiP) | api.cquest.org/dvf | Semestrielle | Prix vente France entiere |
| Carte des loyers ANIL | data.gouv.fr | Annuelle | Loyers residentiels par commune |
| Banque de France | webstat.banque-france.fr | Mensuelle | Taux credits immo residentiels |
| ImmoStat (GIE) | immostat.com | Trimestrielle | Bureaux IdF (saisie manuelle) |

**Fichier source :**
- `shared/schema.ts` — Tables `ref_taux_emprunt`, `ref_valeurs_venales`, `ref_valeurs_locatives`, `ref_taux_capitalisation`
- `server/routes/am-marche.ts` — CRUD + endpoints sync
- `server/lib/sync-dvf.ts` — Sync DVF
- `server/lib/sync-anil.ts` — Sync ANIL
- `server/lib/compute-taux-capi.ts` — Calcul taux capi derive
- `client/src/lib/market-utils.ts` — Helpers comparaison, badges
- `client/src/pages/asset-management/DonneesMarche.tsx` — Page Donnees de Marche (4 onglets)

---

## Annexe — Fichiers source

| Fichier | Contenu |
|---------|---------|
| `client/src/lib/am-calculations.ts` | Toutes les formules AM |
| `client/src/lib/metrics-glossary.ts` | Glossaire des metriques |
| `client/src/lib/utils.ts` | Formatage (devise, %, nombres) |
| `shared/schema.ts` | Schema BDD (Drizzle/PostgreSQL) |
| `server/routes/am.ts` | API Asset Management |
| `server/routes/am-marche.ts` | API Donnees de Marche (CRUD + sync) |
| `server/lib/sync-dvf.ts` | Sync DVF (valeurs venales) |
| `server/lib/sync-anil.ts` | Sync ANIL (valeurs locatives) |
| `server/lib/compute-taux-capi.ts` | Calcul taux de capitalisation derive |
| `client/src/lib/market-utils.ts` | Helpers marche (comparaison, badges, lookup) |
| `client/src/pages/asset-management/DonneesMarche.tsx` | Page Donnees de Marche |
| `server/routes/gl.ts` | API Gestion Locative (incl. indexation auto) |
| `client/src/pages/asset-management/Dashboard.tsx` | Dashboard AM |
| `client/src/pages/asset-management/Simulateur.tsx` | DCF, stress, projections |
| `client/src/pages/gestion-locative/Dashboard.tsx` | Dashboard GL |
| `client/src/pages/gestion-locative/KPI.tsx` | KPIs GL |
| `client/src/pages/gestion-locative/Baux.tsx` | Liste & formulaire baux GL |
