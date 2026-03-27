/**
 * Axe 7 — Stratégies de scraping intelligent par type d'actif
 *
 * Adapte les paramètres de scraping selon le type d'actif :
 * - Résidentiel : tous les scrapers, rayon 5km
 * - Commercial : focus BureauxLocaux + SeLoger BC, rayon 10km
 * - Bureau : focus BureauxLocaux + SeLoger BC, rayon 15km
 * - Crèche : résidentiel + commercial, rayon 10km, filtre surface
 * - Mixte : tous les scrapers, rayon 5km
 */
import type { Scraper, ScrapingContext } from "./base";
import { meilleursAgentsScraper } from "./meilleursagents";
import { leboncoinScraper } from "./leboncoin";
import { selogerScraper } from "./seloger";
import { papScraper } from "./pap";
import { selogerBCScraper } from "./seloger-bc";
import { bureauxLocauxScraper } from "./bureauxlocaux";

export interface ScrapingStrategy {
  scrapers: Scraper[];
  rayonKm: number;
  rayonFallbackKm: number;
  typeBienOverrides: string[]; // Types de biens à chercher
  surfaceFilter?: { min?: number; max?: number };
  notes: string;
}

const ALL_SCRAPERS: Scraper[] = [
  meilleursAgentsScraper, leboncoinScraper, selogerScraper,
  papScraper, selogerBCScraper, bureauxLocauxScraper,
];

const RESIDENTIAL_SCRAPERS: Scraper[] = [
  meilleursAgentsScraper, leboncoinScraper, selogerScraper, papScraper,
];

const COMMERCIAL_SCRAPERS: Scraper[] = [
  selogerBCScraper, bureauxLocauxScraper, leboncoinScraper,
];

export function getScrapingStrategy(typeActif: string | null, surface?: number): ScrapingStrategy {
  const type = (typeActif || "résidentiel").toLowerCase();

  switch (type) {
    case "bureau":
    case "bureaux":
      return {
        scrapers: COMMERCIAL_SCRAPERS,
        rayonKm: 10,
        rayonFallbackKm: 20,
        typeBienOverrides: ["bureau"],
        notes: "Stratégie bureau: focus plateformes commerciales, rayon élargi",
      };

    case "commercial":
    case "commerce":
      return {
        scrapers: COMMERCIAL_SCRAPERS,
        rayonKm: 8,
        rayonFallbackKm: 15,
        typeBienOverrides: ["local_commercial", "commerce"],
        notes: "Stratégie commercial: plateformes spécialisées, rayon moyen",
      };

    case "crèche":
    case "creche":
      return {
        scrapers: [...RESIDENTIAL_SCRAPERS, ...COMMERCIAL_SCRAPERS],
        rayonKm: 10,
        rayonFallbackKm: 20,
        typeBienOverrides: ["local_commercial", "bureau"],
        surfaceFilter: surface ? { min: surface * 0.7, max: surface * 1.5 } : { min: 200, max: 1000 },
        notes: "Stratégie crèche: résidentiel + commercial, filtre surface 200-1000m²",
      };

    case "mixte":
      return {
        scrapers: ALL_SCRAPERS,
        rayonKm: 5,
        rayonFallbackKm: 10,
        typeBienOverrides: ["appartement", "local_commercial"],
        notes: "Stratégie mixte: tous les scrapers, double recherche résidentiel + commercial",
      };

    case "résidentiel":
    case "residentiel":
    default:
      return {
        scrapers: RESIDENTIAL_SCRAPERS,
        rayonKm: 5,
        rayonFallbackKm: 10,
        typeBienOverrides: ["appartement"],
        notes: "Stratégie résidentiel: plateformes grand public, rayon standard",
      };
  }
}

/**
 * Score de pertinence d'un résultat de scraping (0-100)
 * basé sur la cohérence avec les données existantes de l'actif.
 */
export function scoreScrapingResult(
  result: {
    prixM2Median?: number | null;
    loyerM2MensuelMedian?: number | null;
    nbAnnonces?: number | null;
  },
  context: {
    prixM2Actif?: number;
    loyerM2Actif?: number;
    surfaceActif?: number;
  },
): number {
  let score = 50; // base

  // More listings = more reliable
  const nb = result.nbAnnonces || 0;
  if (nb >= 50) score += 20;
  else if (nb >= 20) score += 15;
  else if (nb >= 10) score += 10;
  else if (nb >= 5) score += 5;
  else if (nb === 0) score -= 10;

  // Price coherence
  if (result.prixM2Median && context.prixM2Actif && context.prixM2Actif > 0) {
    const ecart = Math.abs(result.prixM2Median - context.prixM2Actif) / context.prixM2Actif;
    if (ecart < 0.1) score += 15;
    else if (ecart < 0.3) score += 10;
    else if (ecart > 0.5) score -= 10;
  }

  // Rent coherence
  if (result.loyerM2MensuelMedian && context.loyerM2Actif && context.loyerM2Actif > 0) {
    const ecart = Math.abs(result.loyerM2MensuelMedian - context.loyerM2Actif) / context.loyerM2Actif;
    if (ecart < 0.15) score += 15;
    else if (ecart < 0.3) score += 10;
    else if (ecart > 0.5) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
