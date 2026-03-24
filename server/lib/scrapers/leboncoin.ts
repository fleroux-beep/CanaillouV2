/**
 * Scraper LeBonCoin — Annonces immobilières vente et location.
 * Utilise l'API publique de recherche LeBonCoin.
 *
 * LeBonCoin expose une API JSON pour les résultats de recherche
 * accessible via leur endpoint public.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchWithRetry, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.leboncoin.fr";

// LeBonCoin category IDs
const CATEGORY_VENTE: Record<string, number> = {
  appartement: 9, // Ventes immobilières
  maison: 9,
  local_commercial: 9,
  bureau: 9,
  commerce: 9,
};

const CATEGORY_LOCATION: Record<string, number> = {
  appartement: 10, // Locations
  maison: 10,
  local_commercial: 10,
  bureau: 10,
  commerce: 10,
};

// Real estate types for LeBonCoin search
const REAL_ESTATE_TYPE: Record<string, number[]> = {
  appartement: [1], // 1 = Appartement
  maison: [2],      // 2 = Maison
  local_commercial: [5, 6], // 5 = Commerce, 6 = Loft/Atelier
  bureau: [5, 6],
  commerce: [5],
};

interface LBCListing {
  price: number;
  surface: number;
  prixM2: number;
}

function buildSearchUrl(ctx: ScrapingContext, typeRecherche: "vente" | "location"): string {
  const category = typeRecherche === "vente"
    ? (CATEGORY_VENTE[ctx.typeBien] || 9)
    : (CATEGORY_LOCATION[ctx.typeBien] || 10);

  // LeBonCoin search by location + radius
  const params = new URLSearchParams({
    category: String(category),
    locations: `${ctx.ville}_${ctx.codePostal}`,
    lat: String(ctx.lat),
    lng: String(ctx.lng),
    radius: String(Math.round(ctx.rayonKm * 1000)), // in meters
    sort: "time",
    order: "desc",
    limit: "50",
  });

  return `https://${DOMAIN}/recherche?${params}`;
}

function parseListingsFromHtml(html: string): LBCListing[] {
  const listings: LBCListing[] = [];

  // LeBonCoin includes listing data in __NEXT_DATA__ or similar JSON blocks
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const ads = data?.props?.pageProps?.searchData?.ads ||
                  data?.props?.pageProps?.ads ||
                  [];

      for (const ad of ads) {
        const price = ad.price?.[0] || ad.price || 0;
        const attributes = ad.attributes || [];
        const surfaceAttr = attributes.find((a: any) => a.key === "square" || a.key === "surface");
        const surface = surfaceAttr ? parseFloat(surfaceAttr.value) : 0;

        if (price > 0 && surface > 5) {
          listings.push({
            price,
            surface,
            prixM2: Math.round(price / surface),
          });
        }
      }
    } catch { /* parse error — fallback to HTML parsing */ }
  }

  // Fallback: parse price and surface from HTML patterns
  if (listings.length === 0) {
    // Try to find ad cards with price and surface
    const priceMatches = [...html.matchAll(/data-test-id="price"[^>]*>([\d\s.,]+)\s*€/gi)];
    const surfaceMatches = [...html.matchAll(/([\d.,]+)\s*m[²2]/gi)];

    // Pair them up (approximate — same number of each)
    const count = Math.min(priceMatches.length, surfaceMatches.length);
    for (let i = 0; i < count; i++) {
      const price = parseFloat(priceMatches[i][1].replace(/\s/g, "").replace(",", ".")) || 0;
      const surface = parseFloat(surfaceMatches[i][1].replace(",", ".")) || 0;
      if (price > 0 && surface > 5) {
        listings.push({ price, surface, prixM2: Math.round(price / surface) });
      }
    }
  }

  return listings;
}

async function scrapeLBCType(
  ctx: ScrapingContext,
  typeRecherche: "vente" | "location",
): Promise<ScrapedResult | null> {
  const url = buildSearchUrl(ctx, typeRecherche);
  const html = await fetchWithRetry(url, { domain: DOMAIN, timeoutMs: 20000 });
  if (!html) return null;

  const listings = parseListingsFromHtml(html);
  if (listings.length < 1) return null; // Not enough data

  const prixM2Values = listings.map((l) => l.prixM2).filter((v) => v > 50 && v < 100000);
  if (prixM2Values.length < 1) return null;

  const result: ScrapedResult = {
    source: "leboncoin",
    typeRecherche,
    typeBien: ctx.typeBien,
    nbAnnonces: listings.length,
    notes: `LeBonCoin ${typeRecherche} - ${listings.length} annonces dans un rayon de ${ctx.rayonKm}km`,
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

export const leboncoinScraper: Scraper = {
  name: "leboncoin",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    const cacheKey = `lbc:${ctx.codePostal}:${ctx.typeBien}:${ctx.lat}:${ctx.lng}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`LeBonCoin: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien})`);

    const results: ScrapedResult[] = [];

    const vente = await scrapeLBCType(ctx, "vente");
    if (vente) results.push(vente);

    const location = await scrapeLBCType(ctx, "location");
    if (location) results.push(location);

    // Compute taux capi si les deux données sont disponibles
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
