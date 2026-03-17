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
  [key: string]: unknown;
}

export interface AMBail {
  id: string;
  actifId?: string | null;
  lotId?: string | null;
  statut?: string | null;
  loyerMensuel?: string | null;
  loyerAnnuel?: string | null;
  archived?: boolean | null;
  [key: string]: unknown;
}

export interface AMLot {
  id: string;
  actifId: string;
  statut?: string | null;
  loyerMensuel?: string | null;
  loyerAnnuel?: string | null;
  archived?: boolean | null;
  [key: string]: unknown;
}

export interface AMEmprunt {
  id: string;
  sciId?: string | null;
  montantEmprunte?: string | null;
  capitalRestantDu?: string | null;
  tauxAnnuel?: string | null;
  dureeAns?: number | null;
  mensualite?: string | null;
  archived?: boolean | null;
  [key: string]: unknown;
}

export interface AMAssocie {
  id: string;
  nom: string;
  prenom?: string | null;
  [key: string]: unknown;
}

export interface AMParticipation {
  id: string;
  associeId: string;
  sciId: string;
  pourcentage?: string | null;
  montantApport?: string | null;
  [key: string]: unknown;
}

export interface AMSCI {
  id: string;
  nom: string;
  [key: string]: unknown;
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
 * Aucune valeur par défaut. Seules les données en base sont utilisées.
 */
export function getValeurEstimee(actif: AMActif, baux: AMBail[], lots?: AMLot[]): number {
  if (!actif) return 0;

  // Méthode par capitalisation
  const loyerAnnuel = getLoyerAnnuelActif(actif, baux, lots);
  const charges = getChargesAnnuelles(actif);
  const loyerNet = Math.max(0, loyerAnnuel - charges);
  const tauxCapi = Number(actif.tauxCapitalisation || 0);
  const valeurCapitalisation =
    tauxCapi > 0 && loyerNet > 0 ? loyerNet / (tauxCapi / 100) : 0;

  // Méthode par comparables
  const surface = Number(actif.surfaceCarrez || actif.surface || 0);
  const prixM2 = Number(actif.prixM2Marche || 0);
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

/** Annuité d'un emprunt.
 * Si mensualité connue : mensualité × 12.
 * Sinon : calcul actuariel à partir de montant, taux et durée.
 */
export function getAnnuiteEmprunt(emprunt: AMEmprunt): number {
  const mensualite = Number(emprunt?.mensualite || 0);
  if (mensualite > 0) return mensualite * 12;

  // Calcul actuariel si données disponibles
  const montant = Number(emprunt?.montantEmprunte || 0);
  const taux = Number(emprunt?.tauxAnnuel || 0) / 100;
  const duree = Number(emprunt?.dureeAns || 0);

  if (montant <= 0 || duree <= 0) return 0;
  if (taux <= 0) return montant / duree; // Taux 0% : linéaire

  // Formule actuarielle : A = P × [r(1+r)^n] / [(1+r)^n - 1]
  const factor = Math.pow(1 + taux, duree);
  return montant * (taux * factor) / (factor - 1);
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

/** Rendement brut = loyer annuel / valeur */
export function getRendementBrut(loyerAnnuel: number, valeur: number): number {
  if (valeur <= 0) return 0;
  return (loyerAnnuel / valeur) * 100;
}

/** Rendement net = (loyer - charges) / valeur */
export function getRendementNet(loyerAnnuel: number, charges: number, valeur: number): number {
  if (valeur <= 0) return 0;
  return ((loyerAnnuel - charges) / valeur) * 100;
}

/** LTV = dette / valeur */
export function getLTV(dette: number, valeur: number): number {
  if (valeur <= 0) return 0;
  return (dette / valeur) * 100;
}

/** DSCR = NOI / service de la dette */
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
    if (Math.abs(dnpv) < 1e-12) break;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tolerance) return newRate * 100;
    rate = newRate;
    if (rate < -0.99) rate = -0.5;
    if (!Number.isFinite(rate)) return 0;
  }
  return Number.isFinite(rate) ? rate * 100 : 0;
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
  capitalDebut: number;
  annuite: number;
  interets: number;
  capitalAmorti: number;
  capitalFin: number;
}

/**
 * Génère un tableau d'amortissement.
 * Si mensualité connue : utilise la mensualité × 12.
 * Sinon : calcule l'annuité constante (formule actuarielle standard).
 */
export function computeAmortSchedule(emprunt: AMEmprunt): AmortRow[] {
  const montant = Number(emprunt?.montantEmprunte || 0);
  const taux = Number(emprunt?.tauxAnnuel || 0) / 100;
  const duree = Number(emprunt?.dureeAns || 0);
  const mensualite = Number(emprunt?.mensualite || 0);

  if (montant <= 0 || duree <= 0) return [];

  let annuite: number;
  if (mensualite > 0) {
    annuite = mensualite * 12;
  } else if (taux > 0) {
    // Formule actuarielle : A = P × [r(1+r)^n] / [(1+r)^n - 1]
    const factor = Math.pow(1 + taux, duree);
    annuite = montant * (taux * factor) / (factor - 1);
  } else {
    // Taux 0% : amortissement linéaire
    annuite = montant / duree;
  }

  const rows: AmortRow[] = [];
  let capital = montant;

  for (let y = 1; y <= duree && capital > 0.01; y++) {
    const interets = capital * taux;
    const capitalAmorti = Math.min(capital, annuite - interets);
    const capitalFin = Math.max(0, capital - capitalAmorti);
    rows.push({
      year: y,
      capitalDebut: capital,
      annuite: Math.min(annuite, capital + interets),
      interets,
      capitalAmorti,
      capitalFin,
    });
    capital = capitalFin;
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
 * @param totalNAV NAV totale du portefeuille (valorisation - dette)
 * @param totalLoyers Loyers annuels totaux (pour calcul rendement)
 * @param associes Liste des associés
 * @param participations Liste des participations (associeId, sciId, pourcentage, apport)
 */
export function computeAssocieNAV(
  totalNAV: number,
  totalLoyers: number,
  associes: AMAssocie[],
  participations: AMParticipation[],
): AssocieNAV[] {
  return associes.map((a) => {
    const parts = participations.filter((p) => p.associeId === a.id);
    const totalPct = parts.reduce((s, p) => s + Number(p.pourcentage || 0), 0);
    const totalApport = parts.reduce((s, p) => s + Number(p.montantApport || 0), 0);
    const navPart = totalNAV * (totalPct / 100);
    const plusValue = navPart - totalApport;
    const rendement = totalApport > 0 ? ((totalLoyers * (totalPct / 100)) / totalApport) * 100 : 0;

    return {
      associeId: a.id,
      associeNom: `${a.nom || ""} ${a.prenom || ""}`.trim(),
      partPct: totalPct,
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
    // Calcul du taux moyen pondéré depuis les emprunts réels
    let tauxMoyenImplicite = 3; // fallback
    if (emprunts && emprunts.length > 0) {
      let totalPondere = 0;
      let totalCRD = 0;
      for (const e of emprunts) {
        const crd = Number(e.capitalRestantDu || e.montantEmprunte || 0);
        const taux = Number(e.tauxAnnuel || 0);
        if (crd > 0 && taux > 0) {
          totalPondere += crd * taux;
          totalCRD += crd;
        }
      }
      if (totalCRD > 0) tauxMoyenImplicite = totalPondere / totalCRD;
    }
    const debtServiceAjuste = tauxMoyenImplicite > 0
      ? serviceDette * (1 + s.tauxVariation / tauxMoyenImplicite)
      : serviceDette;
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

  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      loyers *= 1 + growthLoyer / 100;
      charges *= 1 + inflationCharges / 100;
      valo *= 1 + appreciationActif / 100;
      dette = Math.max(0, dette - amortissementAnnuel);
    }
    const noi = loyers - charges;
    const cf = noi - serviceDetteBase;
    result.push({
      year: y,
      label: y === 0 ? "Actuel" : `N+${y}`,
      loyers,
      charges,
      noi,
      serviceDette: serviceDetteBase,
      cashFlow: cf,
      valorisation: valo,
      rendementNet: valo > 0 ? (noi / valo) * 100 : 0,
      dscr: serviceDetteBase > 0 ? noi / serviceDetteBase : 0,
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

  for (const a of sciActifs) {
    valorisation += getValeurEstimee(a, allBaux, allLots);
    loyerAnnuel += getLoyerAnnuelActif(a, allBaux, allLots);
    charges += getChargesAnnuelles(a);
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
    rendementBrut: getRendementBrut(loyerAnnuel, valorisation),
    rendementNet: getRendementNet(loyerAnnuel, charges, valorisation),
    ltv: getLTV(crd, valorisation),
    dscr: getDSCR(noi, serviceDette),
    fonds_propres: valorisation - crd,
  };
}
