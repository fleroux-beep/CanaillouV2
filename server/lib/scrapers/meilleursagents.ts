/**
 * Scraper MeilleursAgents — Estimations prix/m² et loyers par adresse.
 * Utilise Playwright pour le rendu JS complet.
 *
 * MeilleursAgents affiche des prix estimés (pas des annonces individuelles),
 * ce qui en fait une source fiable même pour les zones à faible volume.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchPage, getCached, setCache, computeTauxCapi, slugifyVille,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.meilleursagents.com";

function buildUrl(ctx: ScrapingContext): string {
  const ville = slugifyVille(ctx.ville);
  return `https://${DOMAIN}/prix-immobilier/${ville}-${ctx.codePostal}/`;
}

function parsePrice(text: string): number {
  const m = text.replace(/\s/g, "").match(/([\d.,]+)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(",", ".")) || 0;
}

function extractPrices(html: string, typeBien: string): { vente: ScrapedResult | null; location: ScrapedResult | null } {
  let vente: ScrapedResult | null = null;
  let location: ScrapedResult | null = null;

  // 1) Chercher les prix structurés dans des data-attributes ou micro-données
  // MeilleursAgents affiche souvent : "Prix m² moyen : X €/m²"
  const prixVenteMatch = html.match(/prix\s+(?:moyen\s+)?(?:au\s+)?m[²2]\s*(?:pour\s+(?:un\s+)?(?:appartement|maison|local|bureau))?\s*[:\-–]\s*([\d\s.,]+)\s*€/i);
  if (prixVenteMatch) {
    const prix = parsePrice(prixVenteMatch[1]);
    if (prix > 100 && prix < 50000) {
      vente = {
        source: "meilleursagents",
        typeRecherche: "vente",
        typeBien,
        prixM2Median: Math.round(prix),
        notes: "Estimation MeilleursAgents",
      };
    }
  }

  // 2) Chercher les €/m² dans le HTML rendu (Playwright a exécuté le JS)
  if (!vente) {
    const allPrices = [...html.matchAll(/([\d\s]{2,8})\s*€\s*\/\s*m[²2]/gi)];
    const venteValues: number[] = [];
    for (const m of allPrices) {
      const val = parsePrice(m[1]);
      if (val > 500 && val < 50000) venteValues.push(val);
    }
    if (venteValues.length > 0) {
      vente = {
        source: "meilleursagents",
        typeRecherche: "vente",
        typeBien,
        prixM2Median: Math.round(venteValues[0]),
        prixM2Bas: venteValues.length > 1 ? Math.round(Math.min(...venteValues)) : undefined,
        prixM2Haut: venteValues.length > 1 ? Math.round(Math.max(...venteValues)) : undefined,
        nbAnnonces: venteValues.length,
        notes: `MeilleursAgents - ${venteValues.length} valeur(s) extraite(s)`,
      };
    }
  }

  // 3) Loyers
  const loyerMatch = html.match(/loyer\s+(?:moyen\s+)?(?:au\s+)?m[²2]\s*[:\-–]\s*([\d\s.,]+)\s*€/i);
  if (loyerMatch) {
    const loyer = parsePrice(loyerMatch[1]);
    if (loyer > 3 && loyer < 100) {
      location = {
        source: "meilleursagents",
        typeRecherche: "location",
        typeBien,
        loyerM2MensuelMedian: Math.round(loyer * 100) / 100,
        notes: "Estimation MeilleursAgents",
      };
    }
  }

  if (!location) {
    const loyerMatches = [...html.matchAll(/([\d,]+)\s*€\s*\/\s*m[²2]\s*\/?\s*mois/gi)];
    if (loyerMatches.length > 0) {
      const loyer = parsePrice(loyerMatches[0][1]);
      if (loyer > 3 && loyer < 100) {
        location = {
          source: "meilleursagents",
          typeRecherche: "location",
          typeBien,
          loyerM2MensuelMedian: Math.round(loyer * 100) / 100,
          notes: "Estimation MeilleursAgents",
        };
      }
    }
  }

  // Taux de capitalisation si les deux sont disponibles
  if (vente?.prixM2Median && location?.loyerM2MensuelMedian) {
    vente.tauxCapiDeduit = computeTauxCapi(vente.prixM2Median, location.loyerM2MensuelMedian);
    location.tauxCapiDeduit = vente.tauxCapiDeduit;
  }

  return { vente, location };
}

export const meilleursAgentsScraper: Scraper = {
  name: "meilleursagents",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    const cacheKey = `ma:${ctx.codePostal}:${ctx.ville}:${ctx.typeBien}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    const url = buildUrl(ctx);
    logger.info(`MeilleursAgents: scraping ${url}`);

    const pageResult = await fetchPage(url, {
      domain: DOMAIN,
      timeoutMs: 25000,
      waitForSelector: ".prices-summary, .price-container, [class*='price']",
    });

    if (!pageResult) {
      logger.warn(`MeilleursAgents: pas de réponse pour ${ctx.ville} ${ctx.codePostal}`);
      return [];
    }

    const { vente, location } = extractPrices(pageResult.html, ctx.typeBien);
    logger.info(`MeilleursAgents: extraction terminée — vente: ${vente ? `prixM2=${vente.prixM2Median}` : "null"}, ` +
      `location: ${location ? `loyerM2=${location.loyerM2MensuelMedian}` : "null"}`);
    const results: ScrapedResult[] = [];
    if (vente) results.push(vente);
    if (location) results.push(location);

    if (results.length > 0) setCache(cacheKey, results);
    return results;
  },
};
