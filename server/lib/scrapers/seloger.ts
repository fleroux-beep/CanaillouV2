/**
 * Scraper SeLoger — Annonces immobilières vente et location (résidentiel).
 * Source: seloger.com
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchWithRetry, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.seloger.com";

// SeLoger property type codes
const PROPERTY_TYPES: Record<string, string> = {
  appartement: "1",
  maison: "2",
  local_commercial: "6",
  bureau: "8",
  commerce: "6",
};

function buildSearchUrl(ctx: ScrapingContext, typeRecherche: "vente" | "location"): string {
  const transactionType = typeRecherche === "vente" ? "2" : "1";
  const propType = PROPERTY_TYPES[ctx.typeBien] || "1";

  const params = new URLSearchParams({
    types: transactionType,
    projects: transactionType,
    places: `[{cp:${ctx.codePostal}}]`,
    qsVersion: "1.0",
    LISTING_TYPE_ID: transactionType,
    propertyType: propType,
  });

  return `https://${DOMAIN}/list.htm?${params}`;
}

interface SLListing {
  price: number;
  surface: number;
  prixM2: number;
}

function parseListings(html: string): SLListing[] {
  const listings: SLListing[] = [];

  // SeLoger uses __NEXT_DATA__ or window.__INITIAL_STATE__
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i)
    || html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

  if (stateMatch) {
    try {
      const data = JSON.parse(stateMatch[1]);
      const cards = data?.cards || data?.props?.pageProps?.cards ||
                    data?.searchResults?.cards || [];

      for (const card of cards) {
        const price = card.price || card.pricing?.price || 0;
        const surface = card.livingArea || card.surface || card.surfaceArea || 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
      }
    } catch { /* parse error */ }
  }

  // Fallback: regex-based extraction
  if (listings.length === 0) {
    const pricePattern = /"price"\s*:\s*(\d+)/g;
    const surfacePattern = /"livingArea"\s*:\s*([\d.]+)/g;

    const prices: number[] = [];
    const surfaces: number[] = [];

    let m;
    while ((m = pricePattern.exec(html)) !== null) prices.push(Number(m[1]));
    while ((m = surfacePattern.exec(html)) !== null) surfaces.push(Number(m[1]));

    const count = Math.min(prices.length, surfaces.length);
    for (let i = 0; i < count; i++) {
      if (prices[i] > 0 && surfaces[i] > 5) {
        listings.push({ price: prices[i], surface: surfaces[i], prixM2: Math.round(prices[i] / surfaces[i]) });
      }
    }
  }

  return listings;
}

async function scrapeType(
  ctx: ScrapingContext,
  typeRecherche: "vente" | "location",
): Promise<ScrapedResult | null> {
  const url = buildSearchUrl(ctx, typeRecherche);
  const html = await fetchWithRetry(url, { domain: DOMAIN });
  if (!html) return null;

  const listings = parseListings(html);
  if (listings.length < 2) return null;

  const prixM2Values = listings.map((l) => l.prixM2).filter((v) => v > 50 && v < 100000);
  if (prixM2Values.length < 2) return null;

  const result: ScrapedResult = {
    source: "seloger",
    typeRecherche,
    typeBien: ctx.typeBien,
    nbAnnonces: listings.length,
    notes: `SeLoger ${typeRecherche} - ${listings.length} annonces (${ctx.codePostal})`,
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

export const selogerScraper: Scraper = {
  name: "seloger",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    const cacheKey = `sl:${ctx.codePostal}:${ctx.typeBien}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`SeLoger: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien})`);

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
