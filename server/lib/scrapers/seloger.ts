/**
 * Scraper SeLoger — Annonces immobilières vente et location (résidentiel).
 * Utilise Playwright pour le rendu JS complet.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchPage, getCached, setCache,
  median, percentile, computeTauxCapi, filterPlausiblePrixM2,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.seloger.com";

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

function extractListings(html: string): SLListing[] {
  const listings: SLListing[] = [];

  // 1) __NEXT_DATA__ ou __INITIAL_STATE__
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i)
    || html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

  if (stateMatch) {
    try {
      const data = JSON.parse(stateMatch[1]);
      const cards = data?.cards || data?.props?.pageProps?.cards
        || data?.searchResults?.cards || data?.props?.pageProps?.searchData?.cards || [];

      for (const card of cards) {
        const price = card.price || card.pricing?.price || card.listPrice || 0;
        const surface = card.livingArea || card.surface || card.surfaceArea || card.area || 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
      }
    } catch { /* parse error */ }
  }

  // 2) JSON-LD structured data
  if (listings.length === 0) {
    const jsonLdMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of jsonLdMatches) {
      try {
        const ld = JSON.parse(m[1]);
        if (ld?.["@type"] === "ItemList" && ld?.itemListElement) {
          for (const item of ld.itemListElement) {
            const offer = item?.item?.offers || item?.offers || {};
            const price = Number(offer.price) || 0;
            const surface = Number(item?.item?.floorSize?.value) || 0;
            if (price > 0 && surface > 5) {
              listings.push({ price, surface, prixM2: Math.round(price / surface) });
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 3) Fallback regex : "price":123456 et "livingArea":78
  if (listings.length === 0) {
    const pricePattern = /"price"\s*:\s*(\d+)/g;
    const surfacePattern = /"(?:livingArea|surface|area)"\s*:\s*([\d.]+)/g;

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
  logger.info(`SeLoger [${typeRecherche}]: URL construite → ${url}`);

  const pageResult = await fetchPage(url, {
    domain: DOMAIN,
    timeoutMs: 25000,
    waitForSelector: "[data-test='sl.card-container']",
  });

  if (!pageResult) {
    logger.warn(`SeLoger [${typeRecherche}]: fetchPage a retourné null`);
    return null;
  }

  const finalUrl = pageResult.url;
  logger.info(`SeLoger [${typeRecherche}]: page récupérée (${pageResult.html.length} chars), URL finale: ${finalUrl}`);

  // Détection de redirection hors recherche
  if (!finalUrl.includes("seloger.com") || finalUrl.endsWith("seloger.com/")) {
    logger.warn(`SeLoger [${typeRecherche}]: REDIRECTION détectée — URL finale "${finalUrl}" n'est pas une page de recherche. Résultats ignorés.`);
    return null;
  }

  const listings = extractListings(pageResult.html);
  logger.info(`SeLoger [${typeRecherche}]: ${listings.length} annonces extraites`);
  if (listings.length < 1) {
    logger.warn(`SeLoger [${typeRecherche}]: aucune annonce extraite — abandon`);
    return null;
  }

  const allPrixM2 = listings.map((l) => l.prixM2);
  const isCommercial = ["local_commercial", "bureau", "commerce"].includes(ctx.typeBien);
  const plausibility = filterPlausiblePrixM2(allPrixM2, typeRecherche, isCommercial);
  if (plausibility.reason) {
    logger.info(`SeLoger [${typeRecherche}]: filtre plausibilité → ${plausibility.reason}`);
  }
  logger.info(`SeLoger [${typeRecherche}]: ${plausibility.values.length}/${allPrixM2.length} prix/m² plausibles. ` +
    `Valeurs brutes (5 premiers): ${allPrixM2.slice(0, 5).join(", ")}`);
  if (plausibility.values.length < 1) {
    logger.warn(`SeLoger [${typeRecherche}]: aucun prix/m² plausible — abandon`);
    return null;
  }
  const prixM2Values = plausibility.values;

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
    const cacheKey = `sl:${ctx.codePostal}:${ctx.typeBien}:${ctx.rayonKm}`;
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
