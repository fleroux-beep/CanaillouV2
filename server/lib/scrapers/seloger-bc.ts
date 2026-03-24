/**
 * Scraper SeLoger Bureaux & Commerces — Immobilier professionnel.
 * Utilise Playwright pour le rendu JS complet.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchPage, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "bureauxcommerces.seloger.com";

const PROPERTY_TYPES: Record<string, string> = {
  bureau: "bureau",
  local_commercial: "local-commercial",
  commerce: "local-commercial",
  appartement: "bureau",
};

function buildUrl(ctx: ScrapingContext, typeRecherche: "vente" | "location"): string {
  const typePath = PROPERTY_TYPES[ctx.typeBien] || "bureau";
  const transaction = typeRecherche === "vente" ? "achat" : "location";

  const villePath = ctx.ville.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");

  return `https://${DOMAIN}/${transaction}/${typePath}/${villePath}-${ctx.codePostal}/`;
}

interface BCListing {
  price: number;
  surface: number;
  prixM2: number;
}

function extractListings(html: string): BCListing[] {
  const listings: BCListing[] = [];

  // 1) __NEXT_DATA__
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const cards = data?.props?.pageProps?.cards
        || data?.props?.pageProps?.searchResults?.cards || [];

      for (const card of cards) {
        const price = card.price || card.pricing?.price || 0;
        const surface = card.livingArea || card.surface || card.surfaceArea || 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
      }
    } catch { /* parse error */ }
  }

  // 2) JSON dans le HTML rendu
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

  // 3) Fallback regex
  if (listings.length === 0) {
    const priceMatches = [...html.matchAll(/([\d\s.,]+)\s*€\s*(?:\/\s*mois|HT|HC)?/gi)];
    const surfaceMatches = [...html.matchAll(/([\d.,]+)\s*m[²2]/gi)];

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

async function scrapeType(
  ctx: ScrapingContext,
  typeRecherche: "vente" | "location",
): Promise<ScrapedResult | null> {
  const url = buildUrl(ctx, typeRecherche);
  logger.info(`SeLoger B&C [${typeRecherche}]: URL construite → ${url}`);

  const pageResult = await fetchPage(url, {
    domain: DOMAIN,
    timeoutMs: 25000,
    waitForSelector: "[class*='card'], [class*='listing']",
  });

  if (!pageResult) {
    logger.warn(`SeLoger B&C [${typeRecherche}]: fetchPage a retourné null`);
    return null;
  }

  logger.info(`SeLoger B&C [${typeRecherche}]: page récupérée (${pageResult.html.length} chars), URL finale: ${pageResult.url}`);

  const listings = extractListings(pageResult.html);
  logger.info(`SeLoger B&C [${typeRecherche}]: ${listings.length} annonces extraites`);
  if (listings.length < 1) {
    logger.warn(`SeLoger B&C [${typeRecherche}]: aucune annonce extraite — abandon`);
    return null;
  }

  const allPrixM2 = listings.map((l) => l.prixM2);
  const prixM2Values = allPrixM2.filter((v) => v > 10 && v < 100000);
  logger.info(`SeLoger B&C [${typeRecherche}]: ${prixM2Values.length}/${allPrixM2.length} prix/m² valides. ` +
    `Valeurs brutes (5 premiers): ${allPrixM2.slice(0, 5).join(", ")}`);
  if (prixM2Values.length < 1) {
    logger.warn(`SeLoger B&C [${typeRecherche}]: aucun prix/m² valide — abandon`);
    return null;
  }

  const result: ScrapedResult = {
    source: "seloger_bc",
    typeRecherche,
    typeBien: ctx.typeBien,
    nbAnnonces: listings.length,
    notes: `SeLoger B&C ${typeRecherche} - ${listings.length} annonces (${ctx.codePostal})`,
  };

  if (typeRecherche === "vente") {
    result.prixM2Median = Math.round(median(prixM2Values));
    result.prixM2Bas = Math.round(percentile(prixM2Values, 0.25));
    result.prixM2Haut = Math.round(percentile(prixM2Values, 0.75));
  } else {
    const isAnnual = prixM2Values.every((v) => v > 50);
    const divisor = isAnnual ? 12 : 1;
    result.loyerM2MensuelMedian = Math.round((median(prixM2Values) / divisor) * 100) / 100;
    result.loyerM2MensuelBas = Math.round((percentile(prixM2Values, 0.25) / divisor) * 100) / 100;
    result.loyerM2MensuelHaut = Math.round((percentile(prixM2Values, 0.75) / divisor) * 100) / 100;
  }

  return result;
}

export const selogerBCScraper: Scraper = {
  name: "seloger_bc",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    if (!["bureau", "local_commercial", "commerce"].includes(ctx.typeBien)) {
      return [];
    }

    const cacheKey = `slbc:${ctx.codePostal}:${ctx.typeBien}:${ctx.rayonKm}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`SeLoger B&C: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien})`);

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
