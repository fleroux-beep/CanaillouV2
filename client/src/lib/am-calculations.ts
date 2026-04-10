/**
 * Module centralisé de calculs Asset Management.
 * Source unique de vérité pour toutes les pages AM.
 * Aucune valeur par défaut — uniquement les données stockées en base.
 */

// ============================================================
// Interfaces — Types alignés sur le schéma Drizzle (shared/schema.ts)
// ============================================================

export interface AMActif {
  id: string;
  sciId?: string | null;
  nom: string;
  codePostal?: string | null;
  type?: string | null;
  surface?: string | null;
  surfaceCarrez?: string | null;
  prixAcquisition?: string | null;
  fraisNotaire?: string | null;
  fraisAgence?: string | null;
  montantTravaux?: string | null;
  chargesAnnuelles?: string | null;
  taxeFonciere?: string | null;
  assurancePno?: string | null;
  chargesCopropriete?: string | null;
  tauxCapitalisation?: string | null;
  prixM2Marche?: string | null;
  archived?: boolean | null;
}

/** Données de marché optionnelles pour enrichir les calculs */
export interface MarketRefs {
  prixM2?: number;   // prix/m² marché (DVF ou manuel)
  tauxCapi?: number;  // taux de capitalisation marché (%)
  loyerM2?: number;   // loyer/m²/an marché
}

export interface AMBail {
  id: string;
  actifId?: string | null;
  lotId?: string | null;
  statut?: string | null;
  loyerMensuel?: string | null;
  loyerAnnuel?: string | null;
  archived?: boolean | null;
}

export interface AMLot {
  id: string;
  actifId: string;
  statut?: string | null;
  loyerMensuel?: string | null;
  loyerAnnuel?: string | null;
  archived?: boolean | null;
}

export interface AMEmprunt {
  id: string;
  sciId?: string | null;
  montantEmprunte?: string | null;
  capitalRestantDu?: string | null;
  tauxAnnuel?: string | null;
  dureeAns?: number | null;
  mensualite?: string | null;
  tauxAssurance?: string | null;
  assuranceMensuelle?: string | null;
  dateDebut?: string | null;
  archived?: boolean | null;
}

export interface AMAssocie {
  id: string;
  nom: string;
  prenom?: string | null;
}

export interface AMParticipation {
  id: string;
  associeId: string;
  sciId: string;
  pourcentage?: string | null;
  montantApport?: string | null;
}

export interface AMSCI {
  id: string;
  nom: string;
}

// ============================================================
// Loyers
// ============================================================

/** Loyer annuel d'un actif = somme des loyers des baux actifs */
export function getLoyerAnnuelActif(actif: AMActif, baux: AMBail[], lots?: AMLot[]): number {
  if (!actif || !baux) return 0;

  // Baux liés à cet actif
  const bauxActif = baux.filter(
    (b) => b.actifId === actif.id && b.statut !== "résilié" && !b.archived
  );

  if (bauxActif.length > 0) {
    return bauxActif.reduce((sum, b) => {
      const annuel = Number(b.loyerAnnuel || 0);
      if (annuel > 0) return sum + annuel;
      return sum + Number(b.loyerMensuel || 0) * 12;
    }, 0);
  }

  // Fallback: somme des loyers des lots loués
  if (lots) {
    const lotsActif = lots.filter(
      (l) => l.actifId === actif.id && l.statut === "loué" && !l.archived
    );
    return lotsActif.reduce((sum, l) => {
      const annuel = Number(l.loyerAnnuel || 0);
      if (annuel > 0) return sum + annuel;
      return sum + Number(l.loyerMensuel || 0) * 12;
    }, 0);
  }

  return 0;
}

// ============================================================
// Charges
// ============================================================

/** Total des charges annuelles d'un actif.
 * chargesAnnuelles = charges de copropriété (legacy field)
 * chargesCopropriete = charges de copropriété (explicit field)
 * On utilise chargesCopropriete en priorité, sinon chargesAnnuelles comme fallback.
 */
export function getChargesAnnuelles(actif: AMActif): number {
  if (!actif) return 0;
  const copro = Number(actif.chargesCopropriete || actif.chargesAnnuelles || 0);
  return (
    copro +
    Number(actif.taxeFonciere || 0) +
    Number(actif.assurancePno || 0)
  );
}

// ============================================================
// Valorisation
// ============================================================

/** Prix d'acquisition total (prix + frais + travaux) */
export function getPrixAcquisition(actif: AMActif): number {
  if (!actif) return 0;
  return (
    Number(actif.prixAcquisition || 0) +
    Number(actif.fraisNotaire || 0) +
    Number(actif.fraisAgence || 0) +
    Number(actif.montantTravaux || 0)
  );
}

/**
 * Valeur estimée d'un actif — médiane des méthodes disponibles.
 *
 * - Méthode capitalisation : loyer net / taux de capitalisation
 * - Méthode comparables : surface × prix/m² marché
 * - Si les deux sont disponibles : médiane (= moyenne avec 2 valeurs)
 * - Si une seule est disponible : cette valeur
 * - Sinon : prix d'acquisition
 *
 * Priorité des données :
 * 1. Données saisies sur l'actif (tauxCapitalisation, prixM2Marche)
 * 2. Données du référentiel marché (marketRefs) en fallback
 * 3. Prix d'acquisition en dernier recours
 */
export function getValeurEstimee(actif: AMActif, baux: AMBail[], lots?: AMLot[], marketRefs?: MarketRefs): number {
  if (!actif) return 0;

  // Méthode par capitalisation
  // Priorité : taux capi saisi > taux capi marché
  const loyerAnnuel = getLoyerAnnuelActif(actif, baux, lots);
  const charges = getChargesAnnuelles(actif);
  const loyerNet = loyerAnnuel - charges;
  const tauxCapi = Number(actif.tauxCapitalisation || 0) || (marketRefs?.tauxCapi || 0);
  // If NOI <= 0, capitalization value is 0 — do not mask negative cash flow
  const valeurCapitalisation =
    tauxCapi > 0 && loyerNet > 0 ? loyerNet / (tauxCapi / 100) : 0;

  // Méthode par comparables
  // Priorité : prix/m² saisi > prix/m² marché (DVF)
  const surface = Number(actif.surfaceCarrez || actif.surface || 0);
  const prixM2 = Number(actif.prixM2Marche || 0) || (marketRefs?.prixM2 || 0);
  const valeurComparables = surface > 0 && prixM2 > 0 ? surface * prixM2 : 0;

  // Médiane
  if (valeurCapitalisation > 0 && valeurComparables > 0) {
    return (valeurCapitalisation + valeurComparables) / 2;
  }
  if (valeurCapitalisation > 0) return valeurCapitalisation;
  if (valeurComparables > 0) return valeurComparables;

  return getPrixAcquisition(actif);
}

// ============================================================
// Emprunts
// ============================================================

/** Capital restant dû */
export function getCapitalRestantDu(emprunt: AMEmprunt): number {
  return Number(emprunt?.capitalRestantDu || emprunt?.montantEmprunte || 0);
}

/** Annuité d'un emprunt = paiement annuel total (capital + intérêts + assurance).
 *
 * Source de vérité unique : mensualité Excel × 12.
 * Fallback si pas de mensualité stockée : formule actuarielle + taux assurance.
 *
 * Utilisé partout (dashboard, cash-flow, contrôle de gestion, reporting).
 * Pour la décomposition capital/intérêts/assurance → computeAmortSchedule().
 */
export function getAnnuiteEmprunt(emprunt: AMEmprunt): number {
  const mensualite = Number(emprunt?.mensualite || 0);
  if (mensualite > 0) return mensualite * 12;

  // Calcul actuariel mensuel si données disponibles
  const montant = Number(emprunt?.montantEmprunte || 0);
  const tauxAnnuel = Number(emprunt?.tauxAnnuel || 0) / 100;
  const dureeAns = Number(emprunt?.dureeAns || 0);

  if (montant <= 0 || dureeAns <= 0) return 0;

  let mensualiteCalc: number;
  if (tauxAnnuel <= 0) {
    mensualiteCalc = montant / (dureeAns * 12); // Taux 0% : linéaire
  } else {
    // Pas mensuel : r_m = taux annuel / 12, n = durée en mois
    const tauxMensuel = tauxAnnuel / 12;
    const nbMois = dureeAns * 12;
    const factor = Math.pow(1 + tauxMensuel, nbMois);
    mensualiteCalc = montant * (tauxMensuel * factor) / (factor - 1);
  }

  // Ajouter l'assurance emprunteur (calculée sur le capital initial)
  const tauxAssurance = Number(emprunt?.tauxAssurance || 0) / 100;
  if (tauxAssurance > 0) {
    mensualiteCalc += (montant * tauxAssurance) / 12;
  }

  return mensualiteCalc * 12;
}

/** Reconciliation: compare stored mensualité with actuarial formula.
 * Returns null if no mensualité stored, otherwise { formulaAnnual, storedAnnual, ecartPct, status }.
 */
export function reconcileEmprunt(emprunt: AMEmprunt): {
  formulaAnnual: number;
  storedAnnual: number;
  ecartPct: number;
  status: "ok" | "warning" | "error";
  detail: string;
} | null {
  const mensualite = Number(emprunt?.mensualite || 0);
  if (mensualite <= 0) return null;

  const storedAnnual = mensualite * 12;
  const montant = Number(emprunt?.montantEmprunte || 0);
  const tauxAnnuel = Number(emprunt?.tauxAnnuel || 0) / 100;
  const dureeAns = Number(emprunt?.dureeAns || 0);

  if (montant <= 0 || dureeAns <= 0 || tauxAnnuel <= 0) return null;

  const tauxMensuel = tauxAnnuel / 12;
  const nbMois = dureeAns * 12;
  const factor = Math.pow(1 + tauxMensuel, nbMois);
  let mensuCalc = montant * (tauxMensuel * factor) / (factor - 1);

  const tauxAssurance = Number(emprunt?.tauxAssurance || 0) / 100;
  if (tauxAssurance > 0) mensuCalc += (montant * tauxAssurance) / 12;

  const formulaAnnual = mensuCalc * 12;
  const ecartPct = storedAnnual !== 0 ? ((formulaAnnual - storedAnnual) / storedAnnual) * 100 : 0;
  const absEcart = Math.abs(ecartPct);

  let status: "ok" | "warning" | "error";
  let detail: string;
  if (absEcart < 1) {
    status = "ok";
    detail = `Formule = ${Math.round(formulaAnnual).toLocaleString("fr")} vs réel = ${Math.round(storedAnnual).toLocaleString("fr")} (${ecartPct > 0 ? "+" : ""}${ecartPct.toFixed(1)}%)`;
  } else if (absEcart < 5) {
    status = "warning";
    detail = `Écart modéré: formule = ${Math.round(formulaAnnual).toLocaleString("fr")} vs réel = ${Math.round(storedAnnual).toLocaleString("fr")} (${ecartPct > 0 ? "+" : ""}${ecartPct.toFixed(1)}%)`;
  } else {
    status = "error";
    detail = ecartPct > 0
      ? `Formule > réel de ${absEcart.toFixed(1)}%: probable année partielle ou différé`
      : `Formule < réel de ${absEcart.toFixed(1)}%: probable fin de prêt ou échéancier non standard`;
  }

  return { formulaAnnual, storedAnnual, ecartPct, status, detail };
}

/** Service de la dette annuel pour une liste d'emprunts */
export function getServiceDette(emprunts: AMEmprunt[]): number {
  return emprunts.reduce((sum, e) => sum + getAnnuiteEmprunt(e), 0);
}

/** Total capital restant dû */
export function getTotalCRD(emprunts: AMEmprunt[]): number {
  return emprunts.reduce((sum, e) => sum + getCapitalRestantDu(e), 0);
}

// ============================================================
// Rendements
// ============================================================

/** Rendement brut = loyer annuel / prix d'acquisition */
export function getRendementBrut(loyerAnnuel: number, prixAcquisition: number): number {
  if (prixAcquisition <= 0) return 0;
  return (loyerAnnuel / prixAcquisition) * 100;
}

/** Rendement net = (loyer - charges) / prix d'acquisition */
export function getRendementNet(loyerAnnuel: number, charges: number, prixAcquisition: number): number {
  if (prixAcquisition <= 0) return 0;
  return ((loyerAnnuel - charges) / prixAcquisition) * 100;
}

/** LTV = dette / valeur */
export function getLTV(dette: number, valeur: number): number {
  if (valeur <= 0) return 0;
  return (dette / valeur) * 100;
}

/** DSCR = NOI / service de la dette.
 * Returns 0 when there is no debt (serviceDette <= 0).
 * Callers display "N/A" or "—" when dscr === 0 to indicate absence of debt
 * rather than a bad coverage ratio. Server-side score-sante uses 999 internally
 * for scoring purposes only; the returned metric value is also 0 for consistency.
 */
export function getDSCR(noi: number, serviceDette: number): number {
  if (serviceDette <= 0) return 0;
  return noi / serviceDette;
}

// ============================================================
// TRI / IRR (Taux de Rendement Interne)
// ============================================================

/**
 * Calcul du TRI par méthode Newton-Raphson.
 * cashFlows[0] = investissement initial (négatif), cashFlows[1..n] = flux annuels.
 */
export function computeIRR(cashFlows: number[], maxIterations = 100, tolerance = 1e-7): number | null {
  if (cashFlows.length < 2) return null;
  if (cashFlows[0] >= 0) return null;

  let rate = 0.1;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = Math.pow(1 + rate, t);
      npv += cashFlows[t] / factor;
      if (t > 0) dnpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(dnpv) < 1e-12) return null; // derivative too small — non-convergence
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tolerance) return newRate * 100;
    rate = newRate;
    if (rate < -0.99) rate = -0.5;
    if (!Number.isFinite(rate)) return null;
  }
  // Exhausted iterations without converging — check if we're close enough
  let finalNpv = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    finalNpv += cashFlows[t] / Math.pow(1 + rate, t);
  }
  if (Number.isFinite(rate) && Math.abs(finalNpv) < 1) return rate * 100;
  return null;
}

// ============================================================
// VAN / NPV (Valeur Actuelle Nette)
// ============================================================

/**
 * Calcul de la VAN à un taux d'actualisation donné.
 * discountRate en % (ex: 5 pour 5%).
 */
export function computeNPV(cashFlows: number[], discountRate: number): number {
  const r = discountRate / 100;
  return cashFlows.reduce((npv, cf, t) => npv + cf / Math.pow(1 + r, t), 0);
}

// ============================================================
// DCF (Discounted Cash Flow) — Projection
// ============================================================

export interface DCFResult {
  projectedCashFlows: number[];
  terminalValue: number;
  totalPV: number;
  pvCashFlows: number;
  pvTerminal: number;
  irr: number | null;
}

/**
 * Modèle DCF sur N années avec valeur terminale (Gordon Growth).
 * @param currentNOI NOI actuel
 * @param growthRate taux de croissance annuel (%)
 * @param discountRate WACC / taux d'actualisation (%)
 * @param exitCapRate taux de capitalisation de sortie (%)
 * @param years nombre d'années de projection
 * @param initialInvestment investissement initial (prix d'achat total)
 */
export function computeDCF(
  currentNOI: number,
  growthRate: number,
  discountRate: number,
  exitCapRate: number,
  years: number,
  initialInvestment: number,
): DCFResult {
  const g = growthRate / 100;
  const r = discountRate / 100;

  const projectedCashFlows: number[] = [];
  let pvCashFlows = 0;

  for (let y = 1; y <= years; y++) {
    const cf = currentNOI * Math.pow(1 + g, y);
    projectedCashFlows.push(cf);
    pvCashFlows += cf / Math.pow(1 + r, y);
  }

  // Gordon Growth Model: TV = NOI_(n+1) / (cap_rate - growth_rate)
  const terminalNOI = currentNOI * Math.pow(1 + g, years + 1);
  const exitCap = exitCapRate / 100;
  const terminalValue = exitCap > g + 0.001 ? terminalNOI / (exitCap - g) : 0;
  const pvTerminal = terminalValue / Math.pow(1 + r, years);
  const totalPV = pvCashFlows + pvTerminal;

  const irrFlows = [-initialInvestment, ...projectedCashFlows];
  irrFlows[irrFlows.length - 1] += terminalValue;
  const irr = computeIRR(irrFlows);

  return { projectedCashFlows, terminalValue, totalPV, pvCashFlows, pvTerminal, irr };
}

// ============================================================
// Tableau d'amortissement
// ============================================================

export interface AmortRow {
  year: number;
  /** Année calendaire réelle (ex: 2024), si dateDebut est fourni */
  anneeReelle?: number;
  /** True si c'est l'année en cours de remboursement */
  isCurrent?: boolean;
  capitalDebut: number;
  annuite: number;
  interets: number;
  capitalAmorti: number;
  capitalFin: number;
  assurance: number;
  totalAnnuel: number;
}

/**
 * Génère un tableau d'amortissement avec assurance.
 *
 * Source de vérité unique : la mensualité Excel (paiement bancaire réel).
 *
 * Décomposition :
 *   mensualité_Excel = capital + intérêts + assurance
 *   - intérêts = CRD × taux_mensuel (fait mathématique)
 *   - assurance = mensualité_Excel - formule_actuarielle(montant, taux, durée)
 *                 (déduit automatiquement ; ≥ 0, sinon cap à 0)
 *   - capital = mensualité_Excel - intérêts - assurance
 *
 * Si pas de mensualité stockée → fallback sur formule + tauxAssurance.
 */
export function computeAmortSchedule(emprunt: AMEmprunt): AmortRow[] {
  const montant = Number(emprunt?.montantEmprunte || 0);
  const taux = Number(emprunt?.tauxAnnuel || 0) / 100;
  const duree = Number(emprunt?.dureeAns || 0);
  const mensualiteExcel = Number(emprunt?.mensualite || 0);

  if (montant <= 0 || duree <= 0) return [];

  // 1. Formule actuarielle pure (capital + intérêts uniquement)
  let mensuActuarielle: number;
  if (taux > 0) {
    const rm = taux / 12;
    const n = duree * 12;
    const f = Math.pow(1 + rm, n);
    mensuActuarielle = montant * (rm * f) / (f - 1);
  } else {
    mensuActuarielle = montant / (duree * 12);
  }

  // 2. Déduire l'assurance mensuelle de l'écart Excel vs formule
  let assuranceMensuelle: number;
  let mensuCapInt: number; // mensualité hors assurance (pour le calcul d'amortissement)

  if (mensualiteExcel > 0) {
    // Assurance = écart entre paiement réel et formule pure
    assuranceMensuelle = Math.max(0, mensualiteExcel - mensuActuarielle);
    mensuCapInt = mensualiteExcel - assuranceMensuelle;
  } else {
    // Pas de mensualité Excel → fallback sur tauxAssurance ou assuranceMensuelle
    mensuCapInt = mensuActuarielle;
    assuranceMensuelle = Number(emprunt?.assuranceMensuelle || 0);
    if (assuranceMensuelle === 0) {
      const tauxAssurance = Number(emprunt?.tauxAssurance || 0) / 100;
      if (montant > 0 && tauxAssurance > 0) {
        assuranceMensuelle = (montant * tauxAssurance) / 12;
      }
    }
  }

  const assuranceAnnuelle = assuranceMensuelle * 12;
  const rows: AmortRow[] = [];
  let capital = montant;
  const tauxMensuel = taux / 12;

  // Déterminer l'année de début pour afficher les années réelles
  const dateDebutStr = emprunt?.dateDebut;
  const dateDebut = dateDebutStr ? new Date(dateDebutStr) : null;
  const startYear = dateDebut && !isNaN(dateDebut.getTime()) ? dateDebut.getFullYear() : null;
  const now = new Date();
  const currentYear = now.getFullYear();

  for (let y = 1; y <= duree && capital > 0.01; y++) {
    let interetsAn = 0;
    let capitalAmortiAn = 0;
    for (let m = 0; m < 12 && capital > 0.01; m++) {
      const interetsMois = capital * tauxMensuel;
      const capitalMois = Math.min(capital, mensuCapInt - interetsMois);
      interetsAn += interetsMois;
      capitalAmortiAn += capitalMois;
      capital = Math.max(0, capital - capitalMois);
    }
    const annuiteCapInt = interetsAn + capitalAmortiAn;
    const anneeReelle = startYear != null ? startYear + y - 1 : undefined;
    rows.push({
      year: y,
      anneeReelle,
      isCurrent: anneeReelle === currentYear,
      capitalDebut: capital + capitalAmortiAn,
      annuite: annuiteCapInt,
      interets: interetsAn,
      capitalAmorti: capitalAmortiAn,
      capitalFin: capital,
      assurance: assuranceAnnuelle,
      totalAnnuel: annuiteCapInt + assuranceAnnuelle,
    });
  }
  return rows;
}

// ============================================================
// NAV (Valeur Liquidative) par associé
// ============================================================

export interface AssocieNAV {
  associeId: string;
  associeNom: string;
  partPct: number;
  apport: number;
  navPart: number;
  plusValueLatente: number;
  rendementAnnuelise: number;
}

/**
 * Calcul de la NAV par associé basé sur les participations.
 * Pondère chaque participation par la NAV et les loyers de la SCI correspondante.
 * @param totalNAV NAV totale du portefeuille (valorisation - dette)
 * @param totalLoyers Loyers annuels totaux (pour calcul rendement)
 * @param associes Liste des associés
 * @param participations Liste des participations (associeId, sciId, pourcentage, apport)
 * @param sciKpisList KPIs par SCI (pour pondérer par NAV/loyers de chaque SCI)
 */
export function computeAssocieNAV(
  totalNAV: number,
  totalLoyers: number,
  associes: AMAssocie[],
  participations: AMParticipation[],
  sciKpisList?: SciKpis[],
): AssocieNAV[] {
  return associes.map((a) => {
    const parts = participations.filter((p) => p.associeId === a.id);
    const totalApport = parts.reduce((s, p) => s + Number(p.montantApport || 0), 0);

    let navPart = 0;
    let loyersPart = 0;

    if (sciKpisList && sciKpisList.length > 0) {
      // Pondérer chaque participation par la NAV/loyers de sa SCI
      for (const p of parts) {
        const pct = Number(p.pourcentage || 0) / 100;
        const sciKpi = sciKpisList.find((k) => k.sci.id === p.sciId);
        if (sciKpi) {
          const sciNAV = sciKpi.valorisation - sciKpi.crd;
          navPart += sciNAV * pct;
          loyersPart += sciKpi.loyerAnnuel * pct;
        }
      }
    } else {
      // Fallback si pas de sciKpis : ancien comportement (somme brute des %)
      const totalPct = parts.reduce((s, p) => s + Number(p.pourcentage || 0), 0);
      navPart = totalNAV * (totalPct / 100);
      loyersPart = totalLoyers * (totalPct / 100);
    }

    const plusValue = navPart - totalApport;
    const partPct = totalNAV > 0 ? (navPart / totalNAV) * 100 : 0;
    const rendement = totalApport > 0 ? (loyersPart / totalApport) * 100 : 0;

    return {
      associeId: a.id,
      associeNom: `${a.nom || ""} ${a.prenom || ""}`.trim(),
      partPct,
      apport: totalApport,
      navPart,
      plusValueLatente: plusValue,
      rendementAnnuelise: rendement,
    };
  });
}

// ============================================================
// Stress Test / Sensibilité
// ============================================================

export interface StressScenario {
  label: string;
  vacanceRate: number;
  tauxVariation: number;
  chargesVariation: number;
  loyerAjuste: number;
  chargesAjustees: number;
  noiAjuste: number;
  cashFlowAjuste: number;
  dscr: number;
  rendementNet: number;
  ltv: number;
}

/**
 * Génère des scénarios de stress test.
 */
export function computeStressTests(
  loyerBase: number,
  chargesBase: number,
  serviceDette: number,
  valorisation: number,
  dette: number,
  emprunts?: AMEmprunt[],
): StressScenario[] {
  const scenarios = [
    { label: "Base", vacanceRate: 0, tauxVariation: 0, chargesVariation: 0 },
    { label: "Vacance 10%", vacanceRate: 10, tauxVariation: 0, chargesVariation: 0 },
    { label: "Vacance 20%", vacanceRate: 20, tauxVariation: 0, chargesVariation: 0 },
    { label: "Charges +15%", vacanceRate: 0, tauxVariation: 0, chargesVariation: 15 },
    { label: "Taux +200bp", vacanceRate: 0, tauxVariation: 2, chargesVariation: 0 },
    { label: "Stress severe", vacanceRate: 15, tauxVariation: 1.5, chargesVariation: 10 },
    { label: "Crise majeure", vacanceRate: 25, tauxVariation: 3, chargesVariation: 20 },
  ];

  return scenarios.map((s) => {
    const loyerAjuste = loyerBase * (1 - s.vacanceRate / 100);
    const chargesAjustees = chargesBase * (1 + s.chargesVariation / 100);
    // Recalcul du service de dette emprunt par emprunt avec le taux stressé
    let debtServiceAjuste = serviceDette;
    if (s.tauxVariation !== 0 && emprunts && emprunts.length > 0) {
      debtServiceAjuste = 0;
      for (const e of emprunts) {
        const montant = Number(e.montantEmprunte || 0);
        const tauxBase = Number(e.tauxAnnuel || 0) / 100; // pourcentage → décimal
        const duree = Number(e.dureeAns || 0);
        const tauxStresse = tauxBase + s.tauxVariation / 100; // +200bp = +0.02

        if (montant <= 0 || duree <= 0) continue;
        if (tauxStresse <= 0) {
          debtServiceAjuste += montant / duree;
        } else {
          // Formule mensuelle cohérente avec getAnnuiteEmprunt
          const tauxMensuelStresse = tauxStresse / 12;
          const nbMois = duree * 12;
          const factor = Math.pow(1 + tauxMensuelStresse, nbMois);
          debtServiceAjuste += (montant * (tauxMensuelStresse * factor) / (factor - 1)) * 12;
        }
      }
    }
    const noiAjuste = loyerAjuste - chargesAjustees;
    const cashFlowAjuste = noiAjuste - debtServiceAjuste;
    const dscr = debtServiceAjuste > 0 ? noiAjuste / debtServiceAjuste : 0;
    const rendementNet = valorisation > 0 ? ((loyerAjuste - chargesAjustees) / valorisation) * 100 : 0;
    const ltv = valorisation > 0 ? (dette / valorisation) * 100 : 0;

    return {
      ...s,
      loyerAjuste,
      chargesAjustees,
      noiAjuste,
      cashFlowAjuste,
      dscr,
      rendementNet,
      ltv,
    };
  });
}

// ============================================================
// Projection multi-facteurs
// ============================================================

export interface ProjectionYear {
  year: number;
  label: string;
  loyers: number;
  charges: number;
  noi: number;
  serviceDette: number;
  remboursementCapital: number;
  cashFlow: number;
  valorisation: number;
  rendementNet: number;
  dscr: number;
  ltv: number;
}

export function computeMultiYearProjection(
  loyerBase: number,
  chargesBase: number,
  serviceDetteBase: number,
  valorisationBase: number,
  detteBase: number,
  growthLoyer: number,
  inflationCharges: number,
  appreciationActif: number,
  amortissementAnnuel: number,
  years: number,
): ProjectionYear[] {
  const result: ProjectionYear[] = [];
  let loyers = loyerBase;
  let charges = chargesBase;
  let valo = valorisationBase;
  let dette = detteBase;
  // Durée résiduelle estimée pour calculer la décroissance du service de dette
  const dureeResiduelle = amortissementAnnuel > 0 ? Math.ceil(dette / amortissementAnnuel) : 0;

  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      loyers *= 1 + growthLoyer / 100;
      charges *= 1 + inflationCharges / 100;
      valo *= 1 + appreciationActif / 100;
      dette = Math.max(0, dette - amortissementAnnuel);
    }
    // Service de la dette diminue proportionnellement au capital restant
    const ratioDetteRestante = detteBase > 0 ? dette / detteBase : 0;
    const serviceDette = dette > 0 ? serviceDetteBase * ratioDetteRestante : 0;
    const remboursementCapital = dette > 0 ? Math.min(amortissementAnnuel, dette) : 0;
    const noi = loyers - charges;
    const cf = noi - serviceDette;
    result.push({
      year: y,
      label: y === 0 ? "Actuel" : `N+${y}`,
      loyers,
      charges,
      noi,
      serviceDette,
      remboursementCapital,
      cashFlow: cf,
      valorisation: valo,
      rendementNet: valo > 0 ? (noi / valo) * 100 : 0,
      dscr: serviceDette > 0 ? noi / serviceDette : 0,
      ltv: valo > 0 ? (dette / valo) * 100 : 0,
    });
  }
  return result;
}

// ============================================================
// Agrégation SCI
// ============================================================

export interface SciKpis {
  sci: AMSCI;
  actifs: AMActif[];
  valorisation: number;
  loyerAnnuel: number;
  charges: number;
  noi: number;
  crd: number;
  serviceDette: number;
  cashFlowNet: number;
  rendementBrut: number;
  rendementNet: number;
  ltv: number;
  dscr: number;
  fonds_propres: number;
}

export function computeSciKpis(
  sci: AMSCI,
  allActifs: AMActif[],
  allBaux: AMBail[],
  allLots: AMLot[],
  allEmprunts: AMEmprunt[],
): SciKpis {
  const sciActifs = allActifs.filter((a) => a.sciId === sci.id && !a.archived);
  const sciEmprunts = allEmprunts.filter((e) => e.sciId === sci.id && !e.archived);

  let valorisation = 0;
  let loyerAnnuel = 0;
  let charges = 0;
  let totalPrixAcq = 0;

  for (const a of sciActifs) {
    valorisation += getValeurEstimee(a, allBaux, allLots);
    loyerAnnuel += getLoyerAnnuelActif(a, allBaux, allLots);
    charges += getChargesAnnuelles(a);
    totalPrixAcq += getPrixAcquisition(a);
  }

  const noi = loyerAnnuel - charges;
  const crd = getTotalCRD(sciEmprunts);
  const serviceDette = getServiceDette(sciEmprunts);
  const cashFlowNet = noi - serviceDette;

  return {
    sci,
    actifs: sciActifs,
    valorisation,
    loyerAnnuel,
    charges,
    noi,
    crd,
    serviceDette,
    cashFlowNet,
    rendementBrut: getRendementBrut(loyerAnnuel, totalPrixAcq),
    rendementNet: getRendementNet(loyerAnnuel, charges, totalPrixAcq),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fonds_propres: valorisation - crd,
  };
}
