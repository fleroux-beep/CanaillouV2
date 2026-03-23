/**
 * Scraper MeilleursAgents — Estimations prix/m² et loyers par adresse.
 * Source publique: meilleursagents.com/prix-immobilier/
 *
 * Récupère les prix de vente et loyers médians pour une adresse donnée.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchWithRetry, getCached, setCache, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.meilleursagents.com";

function buildUrl(ctx: ScrapingContext): string {
  // MeilleursAgents utilise un format d'URL basé sur la ville
  const ville = encodeURIComponent(
    ctx.ville.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"),
  );
  return `https://${DOMAIN}/prix-immobilier/${ville}-${ctx.codePostal}/`;
}

function parsePrice(text: string): number {
  // "12 345 €" → 12345
  const m = text.replace(/\s/g, "").match(/([\d.,]+)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(",", ".")) || 0;
}

function extractPrices(html: string, typeBien: string): { vente: ScrapedResult | null; location: ScrapedResult | null } {
  let vente: ScrapedResult | null = null;
  let location: ScrapedResult | null = null;

  // Extract prix/m² vente — pattern: "Prix m2 moyen appartement" or similar
  // MeilleursAgents shows prices in structured data or in visible text

  // Try JSON-LD structured data first
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const content = match.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
        const data = JSON.parse(content);
        // MeilleursAgents sometimes embeds price data in structured data
        if (data?.["@type"] === "Place" || data?.description) {
          // Parse from description if available
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // Parse visible price indicators from HTML
  // Pattern: prix moyen au m² : X €/m²
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

  // Try another pattern: "X €/m²" near "prix" context
  if (!vente) {
    const allPrices = [...html.matchAll(/([\d\s]{2,8})\s*€\s*\/\s*m[²2]/gi)];
    const venteValues: number[] = [];
    for (const m of allPrices) {
      const val = parsePrice(m[1]);
      if (val > 500 && val < 50000) venteValues.push(val);
    }
    if (venteValues.length > 0) {
      // Take the first value as the main price estimate
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

  // Parse loyer indicators
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

  // Try pattern "XX,X €/m²/mois" for loyers
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

  // Compute taux capi if both available
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

    const html = await fetchWithRetry(url, { domain: DOMAIN });
    if (!html) {
      logger.warn(`MeilleursAgents: no response for ${ctx.ville} ${ctx.codePostal}`);
      return [];
    }

    const { vente, location } = extractPrices(html, ctx.typeBien);
    const results: ScrapedResult[] = [];
    if (vente) results.push(vente);
    if (location) results.push(location);

    if (results.length > 0) setCache(cacheKey, results);
    return results;
  },
};
