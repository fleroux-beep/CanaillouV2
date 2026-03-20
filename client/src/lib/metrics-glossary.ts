/**
 * Glossaire centralisé des métriques immobilières.
 * Chaque entrée contient une description synthétique et la formule de calcul le cas échéant.
 */

export interface MetricDef {
  label: string;
  description: string;
  formula?: string;
}

const glossary: Record<string, MetricDef> = {
  // ── Loyers & revenus ──────────────────────────────────────
  loyerHT: {
    label: "Loyer HT",
    description: "Loyer hors taxes annuel perçu ou attendu pour un bien ou un bail.",
  },
  loyerTTC: {
    label: "Loyer TTC",
    description: "Loyer toutes taxes comprises, incluant la TVA ou soumis à la CRL.",
    formula: "Loyer HT × (1 + Taux TVA)",
  },
  loyerBaseHT: {
    label: "Loyer base HT",
    description: "Loyer initial défini au moment de la signature du bail, avant toute indexation.",
  },
  loyerHTActu: {
    label: "Loyer HT actuel",
    description: "Loyer hors taxes après application des indexations successives.",
    formula: "Loyer base HT × (Indice actuel / Indice de base)",
  },
  charges: {
    label: "Charges",
    description: "Charges annuelles du bien (copropriété, taxe foncière, assurance PNO).",
    formula: "Copropriété + Taxe foncière + Assurance PNO",
  },
  chargesAnnuelles: {
    label: "Charges annuelles",
    description: "Total des charges d'exploitation annuelles d'un actif immobilier.",
    formula: "Copropriété + Taxe foncière + Assurance PNO",
  },
  depotGarantie: {
    label: "Dépôt de garantie",
    description: "Somme versée par le locataire à la signature du bail, restituée en fin de bail.",
  },
  taxeFonciere: {
    label: "Taxe foncière",
    description: "Impôt annuel dû par le propriétaire sur les propriétés bâties.",
  },

  // ── Rendements ────────────────────────────────────────────
  noi: {
    label: "NOI",
    description: "Net Operating Income — Résultat net d'exploitation immobilier, avant service de la dette.",
    formula: "Loyers annuels − Charges annuelles",
  },
  rendementBrut: {
    label: "Rendement brut",
    description: "Ratio entre les loyers annuels et la valeur du bien, sans déduction des charges.",
    formula: "(Loyers annuels / Valorisation) × 100",
  },
  rendementNet: {
    label: "Rendement net",
    description: "Ratio entre le NOI et le prix d'acquisition total, tenant compte des charges d'exploitation. Mesure le rendement réel sur le capital investi.",
    formula: "((Loyers − Charges) / Prix d'acquisition) × 100",
  },
  cashFlowNet: {
    label: "Cash-flow net",
    description: "Flux de trésorerie disponible après paiement des charges et du service de la dette.",
    formula: "NOI − Service de la dette",
  },

  // ── Valorisation ──────────────────────────────────────────
  valorisation: {
    label: "Valorisation",
    description: "Valeur estimée d'un actif, calculée comme la médiane des méthodes capitalisation et comparables.",
    formula: "Moyenne(NOI / Taux capi, Surface × Prix/m²)",
  },
  prixAcquisition: {
    label: "Prix d'acquisition",
    description: "Coût total d'acquisition incluant le prix, les frais de notaire, d'agence et les travaux.",
    formula: "Prix + Frais notaire + Frais agence + Travaux",
  },
  tauxCapitalisation: {
    label: "Taux de capitalisation",
    description: "Taux utilisé pour convertir le NOI en valeur patrimoniale. Plus il est bas, plus la valorisation est élevée.",
    formula: "NOI / Valeur du bien × 100",
  },
  plusValueLatente: {
    label: "Plus-value latente",
    description: "Différence entre la valorisation actuelle et le prix d'acquisition total.",
    formula: "Valorisation − Prix d'acquisition total",
  },

  // ── Endettement ───────────────────────────────────────────
  crd: {
    label: "CRD",
    description: "Capital Restant Dû — Montant du capital d'emprunt encore à rembourser.",
  },
  serviceDette: {
    label: "Service de la dette",
    description: "Montant annuel des remboursements d'emprunt (capital + intérêts).",
    formula: "Σ Annuités des emprunts",
  },
  annuite: {
    label: "Annuité",
    description: "Montant total remboursé chaque année pour un emprunt (capital + intérêts).",
    formula: "P × [r(1+r)^n] / [(1+r)^n − 1]",
  },
  mensualite: {
    label: "Mensualité",
    description: "Remboursement mensuel d'un emprunt.",
    formula: "Annuité / 12",
  },
  coutCredit: {
    label: "Coût du crédit",
    description: "Somme totale des intérêts payés sur la durée de l'emprunt.",
    formula: "Σ Intérêts annuels sur la durée",
  },

  // ── Ratios financiers ────────────────────────────────────
  ltv: {
    label: "LTV",
    description: "Loan-to-Value — Ratio d'endettement rapportant la dette à la valeur du patrimoine.",
    formula: "(CRD / Valorisation) × 100",
  },
  dscr: {
    label: "DSCR",
    description: "Debt Service Coverage Ratio — Capacité à couvrir le service de la dette avec le NOI. Seuils : ≥ 1.4× confortable (vert), ≥ 1.2× acceptable (bleu), ≥ 1.0× tendu (orange), < 1.0× déficit — les revenus ne couvrent pas la dette (rouge). Le « Stress DSCR » simule un scénario de crise majeure (vacance 25%, taux +300bp, charges +20%).",
    formula: "NOI / Service de la dette",
  },
  tri: {
    label: "TRI",
    description: "Taux de Rendement Interne — Taux d'actualisation qui annule la VAN d'un investissement.",
    formula: "Taux r tel que Σ CF_t / (1+r)^t = 0",
  },
  van: {
    label: "VAN",
    description: "Valeur Actuelle Nette — Somme des flux de trésorerie actualisés, mesurant la création de valeur.",
    formula: "Σ CF_t / (1 + taux)^t",
  },
  nav: {
    label: "NAV",
    description: "Net Asset Value — Valeur liquidative nette, soit la valorisation du patrimoine moins l'endettement.",
    formula: "Valorisation totale − CRD total",
  },

  // ── Indices ───────────────────────────────────────────────
  ilc: {
    label: "ILC",
    description: "Indice des Loyers Commerciaux — Indice de référence pour la révision des baux commerciaux.",
  },
  irl: {
    label: "IRL",
    description: "Indice de Référence des Loyers — Indice INSEE pour la révision des loyers d'habitation.",
  },
  ilat: {
    label: "ILAT",
    description: "Indice des Loyers des Activités Tertiaires — Indice de révision pour bureaux et activités.",
  },
  icc: {
    label: "ICC",
    description: "Indice du Coût de la Construction — Ancien indice de référence pour la révision des baux.",
  },
  indexation: {
    label: "Indexation",
    description: "Mécanisme de révision automatique du loyer basé sur l'évolution d'un indice de référence.",
    formula: "Nouveau loyer = Loyer base × (Indice actuel / Indice de base)",
  },

  // ── Gestion locative ─────────────────────────────────────
  walt: {
    label: "WALT",
    description: "Weighted Average Lease Term — Durée résiduelle moyenne des baux pondérée par le loyer.",
    formula: "Σ (Durée résiduelle_i × Loyer_i) / Σ Loyers",
  },
  tauxOccupation: {
    label: "Taux d'occupation",
    description: "Pourcentage des lots occupés par rapport au total des lots disponibles.",
    formula: "(Lots loués / Total lots) × 100",
  },
  tauxVacance: {
    label: "Taux de vacance",
    description: "Pourcentage des lots vacants (non loués) par rapport au total.",
    formula: "(Lots vacants / Total lots) × 100",
  },
  tauxRecouvrement: {
    label: "Taux de recouvrement",
    description: "Pourcentage des loyers effectivement perçus par rapport aux loyers facturés.",
    formula: "(Paiements reçus / Loyers appelés) × 100",
  },
  echeanceTriennale: {
    label: "Échéance triennale",
    description: "Date à laquelle le locataire peut résilier un bail commercial (tous les 3 ans en bail 3/6/9).",
  },
  avenant: {
    label: "Avenant",
    description: "Modification contractuelle apportée à un bail en cours (loyer, surface, conditions...).",
  },
  renouvellement: {
    label: "Renouvellement",
    description: "Prolongation d'un bail avec une nouvelle date de fin et éventuellement de nouvelles conditions.",
  },

  // ── Fiscalité ─────────────────────────────────────────────
  tva: {
    label: "TVA",
    description: "Taxe sur la Valeur Ajoutée applicable aux loyers (option TVA sur baux commerciaux).",
  },
  crl: {
    label: "CRL",
    description: "Contribution sur les Revenus Locatifs — Taxe de 2.5% sur les revenus locatifs non soumis à TVA.",
    formula: "Loyer HT × 2.5%",
  },

  // ── Simulation ────────────────────────────────────────────
  dcf: {
    label: "DCF",
    description: "Discounted Cash Flow — Modèle de valorisation par actualisation des flux de trésorerie futurs.",
    formula: "Σ NOI_t / (1+WACC)^t + Valeur terminale / (1+WACC)^n",
  },
  stressTest: {
    label: "Stress test",
    description: "Simulation de scénarios défavorables (vacance, hausse des taux, inflation des charges).",
  },
  stressDscr: {
    label: "Stress DSCR",
    description: "DSCR simulé en scénario de crise majeure : vacance locative 25%, hausse des taux de +300 points de base, inflation des charges de +20%. Indique si le portefeuille peut survivre à un choc sévère. Un Stress DSCR < 1.0× signifie que les revenus ne couvriraient plus le service de la dette en cas de crise.",
    formula: "NOI ajusté (crise) / Service de la dette ajusté (crise)",
  },
  valeurTerminale: {
    label: "Valeur terminale",
    description: "Valeur résiduelle estimée à la fin de la période de projection DCF.",
    formula: "NOI_n+1 / (Taux capi sortie − Taux croissance)",
  },

  // ── Emprunts ──────────────────────────────────────────────
  tauxAnnuel: {
    label: "Taux annuel",
    description: "Taux d'intérêt nominal annuel de l'emprunt.",
  },
  dureeEmprunt: {
    label: "Durée",
    description: "Durée totale de l'emprunt en années.",
  },
  assurance: {
    label: "Assurance emprunteur",
    description: "Cotisation mensuelle d'assurance décès/invalidité sur un emprunt.",
  },
  amortissement: {
    label: "Amortissement",
    description: "Part du capital remboursé à chaque échéance d'un emprunt.",
    formula: "Annuité − Intérêts de la période",
  },

  // ── Patrimoine ────────────────────────────────────────────
  surface: {
    label: "Surface",
    description: "Surface totale du bien en mètres carrés.",
  },
  surfaceCarrez: {
    label: "Surface Carrez",
    description: "Surface habitable mesurée selon la loi Carrez, excluant les surfaces < 1.80m de hauteur.",
  },
  prixM2: {
    label: "Prix / m²",
    description: "Valorisation rapportée au mètre carré, utilisée pour la méthode des comparables.",
    formula: "Valorisation / Surface",
  },
  fondsPropres: {
    label: "Fonds propres",
    description: "Part de la valeur du patrimoine non financée par l'emprunt.",
    formula: "Valorisation − CRD",
  },
};

export default glossary;

/**
 * Retrieve a metric definition by its key.
 * Returns undefined if key not found.
 */
export function getMetric(key: string): MetricDef | undefined {
  return glossary[key];
}
