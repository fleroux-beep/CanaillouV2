/**
 * Moteur d'analyse intelligent des données de marché Phase 2.
 *
 * Responsabilités :
 *  1. Pondérer les sources par nombre d'annonces (volume-weighted)
 *  2. Détecter et exclure les outliers (IQR)
 *  3. Adapter l'analyse au type d'actif (résidentiel, commercial, crèche, bureau)
 *  4. Croiser Phase 1 / Phase 2 pour fiabiliser les estimations
 *  5. Calculer un score de fiabilité (0-100) + note (A-E) pour chaque estimation
 */

// ============================================================
// Types
// ============================================================

export type NoteConfiance = "A" | "B" | "C" | "D" | "E";

export interface SourceAnalysee {
  source: string;
  valeur: number;          // prix/m² ou loyer/m²
  nbAnnonces: number;
  poids: number;           // poids normalisé (0-1) après pondération
  outlier: boolean;        // true si exclu par détection IQR
  rayonKm: number;
}

export interface EstimationPhase2 {
  /** Valeur consolidée (moyenne pondérée après exclusion outliers) */
  valeurConsolidee: number;
  /** Fourchette basse (P25 pondéré) */
  valeurBasse: number;
  /** Fourchette haute (P75 pondéré) */
  valeurHaute: number;
  /** Nb total de sources ayant contribué (hors outliers) */
  nbSources: number;
  /** Nb total d'annonces (hors outliers) */
  nbAnnoncesTotal: number;
  /** Score de fiabilité 0-100 */
  scoreConfiance: number;
  /** Note synthétique A (très fiable) à E (estimation fragile) */
  noteConfiance: NoteConfiance;
  /** Explication humaine de la note */
  explicationConfiance: string;
  /** Détail par source (y compris outliers marqués) */
  sources: SourceAnalysee[];
}

export interface AnalysePhase2 {
  vente: EstimationPhase2 | null;
  location: EstimationPhase2 | null;
  /** Taux de capitalisation consolidé (à partir des estimations consolidées) */
  tauxCapiConsolide: number | null;
  /** Score de fiabilité global du taux capi */
  tauxCapiConfiance: number | null;
  tauxCapiNote: NoteConfiance | null;
}

export interface ContexteAnalyse {
  typeActif: string;
  typeBien: string;
  /** Phase 1 values for cross-referencing */
  p1PrixM2?: number | null;
  p1LoyerM2?: number | null;
  p1TauxCapi?: number | null;
  p1Fiabilite?: string | null;
}

interface SourceBrute {
  source: string;
  valeur: number;
  valeurBas?: number;
  valeurHaut?: number;
  nbAnnonces: number;
  rayonKm: number;
}

// ============================================================
// Configuration par type d'actif
// ============================================================

interface TypeConfig {
  /** Poids bonus pour les sources spécialisées (1 = neutre) */
  sourceWeights: Record<string, number>;
  /** Fourchette de prix/m² plausible (pour filtrage macro) */
  prixM2Min: number;
  prixM2Max: number;
  /** Fourchette de loyer/m² plausible */
  loyerM2Min: number;
  loyerM2Max: number;
  /** Sources considérées fiables pour ce type */
  sourcesFiables: string[];
  /** Score bonus si Phase 1 confirme Phase 2 (écart < 20%) */
  bonusP1Concordance: number;
}

const CONFIGS: Record<string, TypeConfig> = {
  appartement: {
    sourceWeights: {
      meilleursagents: 1.5, // estimation agrégée fiable pour résidentiel
      leboncoin: 1.2,       // gros volume d'annonces
      seloger: 1.3,
      pap: 1.0,
      seloger_bc: 0.3,      // pas pertinent pour résidentiel
      bureauxlocaux: 0.1,   // pas pertinent
    },
    prixM2Min: 500, prixM2Max: 25000,
    loyerM2Min: 3, loyerM2Max: 80,
    sourcesFiables: ["meilleursagents", "seloger", "leboncoin"],
    bonusP1Concordance: 15,
  },
  maison: {
    sourceWeights: {
      meilleursagents: 1.5,
      leboncoin: 1.3,
      seloger: 1.2,
      pap: 1.0,
      seloger_bc: 0.2,
      bureauxlocaux: 0.1,
    },
    prixM2Min: 300, prixM2Max: 20000,
    loyerM2Min: 2, loyerM2Max: 60,
    sourcesFiables: ["meilleursagents", "seloger", "leboncoin"],
    bonusP1Concordance: 15,
  },
  local_commercial: {
    sourceWeights: {
      meilleursagents: 0.8, // moins fiable pour le commercial
      leboncoin: 0.9,
      seloger: 0.7,
      pap: 0.5,
      seloger_bc: 1.5,      // spécialisé B&C
      bureauxlocaux: 1.5,   // spécialisé entreprise
    },
    prixM2Min: 200, prixM2Max: 30000,
    loyerM2Min: 3, loyerM2Max: 200,
    sourcesFiables: ["seloger_bc", "bureauxlocaux"],
    bonusP1Concordance: 10,
  },
  bureau: {
    sourceWeights: {
      meilleursagents: 0.5,
      leboncoin: 0.7,
      seloger: 0.6,
      pap: 0.4,
      seloger_bc: 1.5,
      bureauxlocaux: 1.5,
    },
    prixM2Min: 500, prixM2Max: 30000,
    loyerM2Min: 5, loyerM2Max: 150,
    sourcesFiables: ["seloger_bc", "bureauxlocaux"],
    bonusP1Concordance: 10,
  },
  commerce: {
    sourceWeights: {
      meilleursagents: 0.6,
      leboncoin: 0.8,
      seloger: 0.6,
      pap: 0.5,
      seloger_bc: 1.5,
      bureauxlocaux: 1.5,
    },
    prixM2Min: 200, prixM2Max: 30000,
    loyerM2Min: 5, loyerM2Max: 250,
    sourcesFiables: ["seloger_bc", "bureauxlocaux"],
    bonusP1Concordance: 10,
  },
};

function getConfig(typeBien: string): TypeConfig {
  return CONFIGS[typeBien] || CONFIGS.appartement;
}

// ============================================================
// Détection d'outliers (IQR)
// ============================================================

function detectOutliers(values: number[]): { q1: number; q3: number; low: number; high: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 3) return { q1: sorted[0], q3: sorted[n - 1], low: -Infinity, high: Infinity };

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  // Facteur 1.5 = classique. On utilise 2.0 pour être plus tolérant
  // (les marchés immobiliers ont naturellement une grande dispersion)
  const factor = 2.0;
  return {
    q1,
    q3,
    low: q1 - factor * iqr,
    high: q3 + factor * iqr,
  };
}

// ============================================================
// Calcul de la moyenne pondérée
// ============================================================

function weightedStats(sources: { valeur: number; poids: number }[]): {
  moyenne: number;
  p25: number;
  p75: number;
} {
  if (sources.length === 0) return { moyenne: 0, p25: 0, p75: 0 };
  if (sources.length === 1) return { moyenne: sources[0].valeur, p25: sources[0].valeur, p75: sources[0].valeur };

  const totalPoids = sources.reduce((s, x) => s + x.poids, 0);
  const moyenne = sources.reduce((s, x) => s + x.valeur * x.poids, 0) / totalPoids;

  // Pour P25/P75, on trie par valeur et on interpole avec les poids
  const sorted = [...sources].sort((a, b) => a.valeur - b.valeur);
  let cumPoids = 0;
  let p25 = sorted[0].valeur;
  let p75 = sorted[sorted.length - 1].valeur;

  for (const s of sorted) {
    cumPoids += s.poids;
    if (cumPoids / totalPoids >= 0.25 && p25 === sorted[0].valeur) {
      p25 = s.valeur;
    }
    if (cumPoids / totalPoids >= 0.75 && p75 === sorted[sorted.length - 1].valeur) {
      p75 = s.valeur;
    }
  }

  return { moyenne, p25, p75 };
}

// ============================================================
// Score de confiance
// ============================================================

function computeScore(
  sources: SourceAnalysee[],
  config: TypeConfig,
  p1Value: number | null | undefined,
  consolidee: number,
  mode: "vente" | "location",
): { score: number; explication: string } {
  const valid = sources.filter((s) => !s.outlier);
  if (valid.length === 0) return { score: 0, explication: "Aucune source valide" };

  let score = 0;
  const raisons: string[] = [];

  // 1. Nombre de sources (max 25 pts)
  //    1 source = 5, 2 = 12, 3 = 18, 4+ = 25
  const nbSources = valid.length;
  const ptsSources = Math.min(25, nbSources <= 1 ? 5 : nbSources === 2 ? 12 : nbSources === 3 ? 18 : 25);
  score += ptsSources;
  if (nbSources >= 3) raisons.push(`${nbSources} sources concordantes`);
  else if (nbSources === 1) raisons.push("1 seule source");

  // 2. Volume d'annonces total (max 20 pts)
  const totalAnnonces = valid.reduce((s, x) => s + x.nbAnnonces, 0);
  const ptsVolume = Math.min(20, totalAnnonces >= 50 ? 20 : totalAnnonces >= 20 ? 15 : totalAnnonces >= 10 ? 10 : totalAnnonces >= 3 ? 6 : 2);
  score += ptsVolume;
  if (totalAnnonces >= 20) raisons.push(`${totalAnnonces} annonces au total`);
  else if (totalAnnonces <= 3) raisons.push(`seulement ${totalAnnonces} annonce(s)`);

  // 3. Dispersion inter-sources (max 20 pts)
  //    CoV (coefficient de variation) faible = bon
  if (valid.length >= 2) {
    const values = valid.map((s) => s.valeur);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    const cov = mean > 0 ? stdDev / mean : 1;

    // CoV < 0.10 = excellent (20pts), < 0.20 = bon (15), < 0.35 = moyen (8), > 0.35 = faible (2)
    const ptsDispersion = cov < 0.10 ? 20 : cov < 0.20 ? 15 : cov < 0.35 ? 8 : 2;
    score += ptsDispersion;
    if (cov < 0.15) raisons.push("sources très convergentes");
    else if (cov > 0.30) raisons.push("forte dispersion entre sources");
  } else {
    score += 5; // 1 seule source = pas de dispersion mesurable
  }

  // 4. Qualité des sources (max 15 pts)
  //    Sources spécialisées dans le bon type = bonus
  const hasFiable = valid.some((s) => config.sourcesFiables.includes(s.source));
  if (hasFiable) {
    score += 15;
    raisons.push("source(s) de référence pour ce type");
  } else {
    score += 5;
    raisons.push("pas de source spécialisée");
  }

  // 5. Concordance Phase 1 / Phase 2 (max 15 pts)
  if (p1Value && p1Value > 0 && consolidee > 0) {
    const ecart = Math.abs(consolidee - p1Value) / p1Value;
    if (ecart < 0.10) {
      score += 15;
      raisons.push("Phase 1 et Phase 2 concordantes (<10%)");
    } else if (ecart < 0.20) {
      score += 10;
      raisons.push("Phase 1 et Phase 2 proches (<20%)");
    } else if (ecart < 0.35) {
      score += 5;
      raisons.push(`écart P1/P2 de ${Math.round(ecart * 100)}%`);
    } else {
      score += 0;
      raisons.push(`écart P1/P2 significatif (${Math.round(ecart * 100)}%)`);
    }
  } else {
    // Pas de Phase 1 pour vérifier = on ne pénalise pas mais pas de bonus
    score += 5;
    if (!p1Value) raisons.push("pas de donnée Phase 1 pour recouper");
  }

  // 6. Rayon de recherche (max 5 pts)
  //    5km = meilleur, 10km = fallback = moins fiable
  const avgRayon = valid.reduce((s, x) => s + x.rayonKm, 0) / valid.length;
  if (avgRayon <= 5) {
    score += 5;
  } else {
    score += 2;
    raisons.push("rayon élargi (10km)");
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  return { score, explication: raisons.join(" · ") };
}

function scoreToNote(score: number): NoteConfiance {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "E";
}

const NOTE_LABELS: Record<NoteConfiance, string> = {
  A: "Estimation très fiable",
  B: "Estimation fiable",
  C: "Estimation indicative",
  D: "Estimation fragile",
  E: "Donnée insuffisante",
};

// ============================================================
// Analyse principale
// ============================================================

function analyserEstimation(
  sourcesBrutes: SourceBrute[],
  config: TypeConfig,
  mode: "vente" | "location",
  p1Value: number | null | undefined,
): EstimationPhase2 | null {
  if (sourcesBrutes.length === 0) return null;

  // Plage de plausibilité
  const [plausMin, plausMax] = mode === "vente"
    ? [config.prixM2Min, config.prixM2Max]
    : [config.loyerM2Min, config.loyerM2Max];

  // Filtrage macro (valeurs aberrantes évidentes)
  const plausibles = sourcesBrutes.filter(
    (s) => s.valeur >= plausMin && s.valeur <= plausMax,
  );

  if (plausibles.length === 0) return null;

  // Détection outliers IQR (si assez de sources)
  const iqr = plausibles.length >= 3
    ? detectOutliers(plausibles.map((s) => s.valeur))
    : { low: -Infinity, high: Infinity, q1: 0, q3: 0 };

  // Construction des sources analysées avec poids
  const sourcesAnalysees: SourceAnalysee[] = plausibles.map((s) => {
    const isOutlier = plausibles.length >= 3 && (s.valeur < iqr.low || s.valeur > iqr.high);

    // Poids = nb_annonces * bonus_source_type
    const sourceWeight = config.sourceWeights[s.source] || 1.0;
    const volumeWeight = Math.max(1, Math.log2(s.nbAnnonces + 1)); // log pour atténuer les gros volumes
    const poids = sourceWeight * volumeWeight;

    return {
      source: s.source,
      valeur: s.valeur,
      nbAnnonces: s.nbAnnonces,
      poids: isOutlier ? 0 : poids,
      outlier: isOutlier,
      rayonKm: s.rayonKm,
    };
  });

  // Normaliser les poids (somme = 1)
  const totalPoids = sourcesAnalysees.reduce((s, x) => s + x.poids, 0);
  if (totalPoids > 0) {
    for (const s of sourcesAnalysees) {
      s.poids = s.poids / totalPoids;
    }
  }

  const valides = sourcesAnalysees.filter((s) => !s.outlier);
  if (valides.length === 0) return null;

  // Moyenne pondérée
  const stats = weightedStats(valides.map((s) => ({ valeur: s.valeur, poids: s.poids })));

  // Arrondi adapté
  const round = mode === "vente"
    ? (v: number) => Math.round(v)
    : (v: number) => Math.round(v * 100) / 100;

  const consolidee = round(stats.moyenne);
  const basse = round(stats.p25);
  const haute = round(stats.p75);

  // Score de fiabilité
  const { score, explication } = computeScore(sourcesAnalysees, config, p1Value, consolidee, mode);
  const note = scoreToNote(score);

  return {
    valeurConsolidee: consolidee,
    valeurBasse: basse,
    valeurHaute: haute,
    nbSources: valides.length,
    nbAnnoncesTotal: valides.reduce((s, x) => s + x.nbAnnonces, 0),
    scoreConfiance: score,
    noteConfiance: note,
    explicationConfiance: `${NOTE_LABELS[note]} — ${explication}`,
    sources: sourcesAnalysees,
  };
}

// ============================================================
// API publique
// ============================================================

/**
 * Analyse complète des données Phase 2 scrapées pour un actif.
 *
 * @param scrapedVente   Lignes vente brutes de refMarcheScraping
 * @param scrapedLocation Lignes location brutes de refMarcheScraping
 * @param contexte       Type d'actif + données Phase 1 pour croisement
 */
export function analyserPhase2(
  scrapedVente: {
    source: string | null;
    prixM2Median: string | null;
    prixM2Bas: string | null;
    prixM2Haut: string | null;
    nbAnnonces: number | null;
    rayonKm: string | null;
  }[],
  scrapedLocation: {
    source: string | null;
    loyerM2MensuelMedian: string | null;
    loyerM2MensuelBas: string | null;
    loyerM2MensuelHaut: string | null;
    nbAnnonces: number | null;
    rayonKm: string | null;
  }[],
  contexte: ContexteAnalyse,
): AnalysePhase2 {
  const config = getConfig(contexte.typeBien);

  // Préparer les sources vente
  const venteBrutes: SourceBrute[] = scrapedVente
    .filter((s) => s.source && s.prixM2Median)
    .map((s) => ({
      source: s.source!,
      valeur: Number(s.prixM2Median),
      valeurBas: s.prixM2Bas ? Number(s.prixM2Bas) : undefined,
      valeurHaut: s.prixM2Haut ? Number(s.prixM2Haut) : undefined,
      nbAnnonces: s.nbAnnonces || 1,
      rayonKm: s.rayonKm ? Number(s.rayonKm) : 5,
    }));

  // Préparer les sources location
  const locationBrutes: SourceBrute[] = scrapedLocation
    .filter((s) => s.source && s.loyerM2MensuelMedian)
    .map((s) => ({
      source: s.source!,
      valeur: Number(s.loyerM2MensuelMedian),
      valeurBas: s.loyerM2MensuelBas ? Number(s.loyerM2MensuelBas) : undefined,
      valeurHaut: s.loyerM2MensuelHaut ? Number(s.loyerM2MensuelHaut) : undefined,
      nbAnnonces: s.nbAnnonces || 1,
      rayonKm: s.rayonKm ? Number(s.rayonKm) : 5,
    }));

  // Analyser
  const vente = analyserEstimation(venteBrutes, config, "vente", contexte.p1PrixM2);
  const location = analyserEstimation(locationBrutes, config, "location", contexte.p1LoyerM2);

  // Taux de capitalisation consolidé
  let tauxCapiConsolide: number | null = null;
  let tauxCapiConfiance: number | null = null;
  let tauxCapiNote: NoteConfiance | null = null;

  if (vente && location && vente.valeurConsolidee > 0 && location.valeurConsolidee > 0) {
    tauxCapiConsolide = Math.round(
      ((location.valeurConsolidee * 12) / vente.valeurConsolidee) * 10000,
    ) / 100;

    // Le score du taux capi est la moyenne des scores vente+location
    // car il dépend de la fiabilité des deux
    tauxCapiConfiance = Math.round((vente.scoreConfiance + location.scoreConfiance) / 2);
    tauxCapiNote = scoreToNote(tauxCapiConfiance);
  }

  return { vente, location, tauxCapiConsolide, tauxCapiConfiance, tauxCapiNote };
}
