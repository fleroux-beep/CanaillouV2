/**
 * Scraper PAP.fr — Annonces entre particuliers (vente et location).
 * Source: pap.fr
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchWithRetry, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.pap.fr";

// PAP URL patterns
const TYPE_VENTE: Record<string, string> = {
  appartement: "appartement",
  maison: "maison",
  local_commercial: "locaux-commerciaux",
  bureau: "bureaux-locaux-professionnels",
  commerce: "locaux-commerciaux",
};

const TYPE_LOCATION: Record<string, string> = {
  appartement: "appartement",
  maison: "maison",
  local_commercial: "local-commercial",
  bureau: "bureau",
  commerce: "local-commercial",
};

function buildUrl(ctx: ScrapingContext, typeRecherche: "vente" | "location"): string {
  const typeMap = typeRecherche === "vente" ? TYPE_VENTE : TYPE_LOCATION;
  const typePath = typeMap[ctx.typeBien] || "appartement";
  const section = typeRecherche === "vente" ? "annonce" : "annonce";
  const transaction = typeRecherche === "vente" ? "vente" : "location";

  const villePath = ctx.ville.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");

  return `https://${DOMAIN}/annonces/${transaction}-${typePath}-${villePath}-${ctx.codePostal}`;
}

interface PAPListing {
  price: number;
  surface: number;
  prixM2: number;
}

function parseListings(html: string): PAPListing[] {
  const listings: PAPListing[] = [];

  // PAP uses structured markup for listings
  // Look for price and surface patterns
  const adBlocks = html.split(/class="[^"]*search-list-item[^"]*"/gi);

  for (const block of adBlocks.slice(1)) { // skip first (before first ad)
    const priceMatch = block.match(/([\d\s.,]+)\s*€/);
    const surfaceMatch = block.match(/([\d.,]+)\s*m[²2]/);

    if (priceMatch && surfaceMatch) {
      const price = parseFloat(priceMatch[1].replace(/\s/g, "").replace(",", ".")) || 0;
      const surface = parseFloat(surfaceMatch[1].replace(",", ".")) || 0;

      if (price > 0 && surface > 5) {
        listings.push({ price, surface, prixM2: Math.round(price / surface) });
      }
    }
  }

  // Fallback: global regex
  if (listings.length === 0) {
    const prices = [...html.matchAll(/class="[^"]*price[^"]*"[^>]*>([\d\s.,]+)\s*€/gi)];
    const surfaces = [...html.matchAll(/([\d.,]+)\s*m[²2]/gi)];

    const count = Math.min(prices.length, surfaces.length);
    for (let i = 0; i < count; i++) {
      const price = parseFloat(prices[i][1].replace(/\s/g, "").replace(",", ".")) || 0;
      const surface = parseFloat(surfaces[i][1].replace(",", ".")) || 0;
      if (price > 0 && surface > 5) {
        listings.push({ price, surface, prixM2: Math.round(price / surface) });
      }
    }
  }

  return listings;
}

async function scrapeType(
  ctx: ScrapingContext,
  typeRecherche: "vente" | "location",
): Promise<ScrapedResult | null> {
  const url = buildUrl(ctx, typeRecherche);
  const html = await fetchWithRetry(url, { domain: DOMAIN });
  if (!html) return null;

  const listings = parseListings(html);
  if (listings.length < 1) return null;

  const prixM2Values = listings.map((l) => l.prixM2).filter((v) => v > 50 && v < 100000);
  if (prixM2Values.length < 1) return null;

  const result: ScrapedResult = {
    source: "pap",
    typeRecherche,
    typeBien: ctx.typeBien,
    nbAnnonces: listings.length,
    notes: `PAP ${typeRecherche} - ${listings.length} annonces (${ctx.codePostal})`,
  };

  if (typeRecherche === "vente") {
    result.prixM2Median = Math.round(median(prixM2Values));
    result.prixM2Bas = Math.round(percentile(prixM2Values, 0.25));
    result.prixM2Haut = Math.round(percentile(prixM2Values, 0.75));
  } else {
    result.loyerM2MensuelMedian = Math.round(median(prixM2Values) * 100) / 100;
    result.loyerM2MensuelBas = Math.round(percentile(prixM2Values, 0.25) * 100) / 100;
    result.loyerM2MensuelHaut = Math.round(percentile(prixM2Values, 0.75) * 100) / 100;
  }

  return result;
}

export const papScraper: Scraper = {
  name: "pap",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    const cacheKey = `pap:${ctx.codePostal}:${ctx.typeBien}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`PAP: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien})`);

    const results: ScrapedResult[] = [];

    const vente = await scrapeType(ctx, "vente");
    if (vente) results.push(vente);

    const location = await scrapeType(ctx, "location");
    if (location) results.push(location);

    if (vente?.prixM2Median && location?.loyerM2MensuelMedian) {
      const taux = computeTauxCapi(vente.prixM2Median, location.loyerM2MensuelMedian);
      if (taux) {
        vente.tauxCapiDeduit = taux;
        location.tauxCapiDeduit = taux;
      }
    }

    if (results.length > 0) setCache(cacheKey, results);
    return results;
  },
};
