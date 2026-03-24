/**
 * Scraper BureauxLocaux — Immobilier d'entreprise.
 * Source: bureauxlocaux.com
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchWithRetry, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.bureauxlocaux.com";

const TYPE_MAP: Record<string, string> = {
  bureau: "bureaux",
  local_commercial: "locaux-commerciaux",
  commerce: "locaux-commerciaux",
  appartement: "bureaux", // fallback
};

function buildUrl(ctx: ScrapingContext, typeRecherche: "vente" | "location"): string {
  const typePath = TYPE_MAP[ctx.typeBien] || "bureaux";
  const transaction = typeRecherche === "vente" ? "achat" : "location";

  return `https://${DOMAIN}/${transaction}-${typePath}/${ctx.codePostal}`;
}

interface BLListing {
  price: number;
  surface: number;
  prixM2: number;
}

function parseListings(html: string): BLListing[] {
  const listings: BLListing[] = [];

  // BureauxLocaux typically shows listings with price and surface
  // Try JSON data first
  const dataMatch = html.match(/window\.__INITIAL_DATA__\s*=\s*({[\s\S]*?});?\s*<\/script>/i)
    || html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);

  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      const ads = data?.props?.pageProps?.listings || data?.listings || data?.ads || [];

      for (const ad of ads) {
        const price = ad.price || ad.rent || ad.amount || 0;
        const surface = ad.surface || ad.area || 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
      }
    } catch { /* parse error */ }
  }

  // Fallback: parse from HTML
  if (listings.length === 0) {
    // Look for card-like structures
    const cards = html.split(/class="[^"]*annonce[^"]*"|class="[^"]*listing[^"]*"/gi);

    for (const card of cards.slice(1)) {
      const priceMatch = card.match(/([\d\s.,]+)\s*€/);
      const surfaceMatch = card.match(/([\d.,]+)\s*m[²2]/);

      if (priceMatch && surfaceMatch) {
        const price = parseFloat(priceMatch[1].replace(/\s/g, "").replace(",", ".")) || 0;
        const surface = parseFloat(surfaceMatch[1].replace(",", ".")) || 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
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

  const prixM2Values = listings.map((l) => l.prixM2).filter((v) => v > 10 && v < 100000);
  if (prixM2Values.length < 1) return null;

  const result: ScrapedResult = {
    source: "bureauxlocaux",
    typeRecherche,
    typeBien: ctx.typeBien,
    nbAnnonces: listings.length,
    notes: `BureauxLocaux ${typeRecherche} - ${listings.length} annonces (${ctx.codePostal})`,
  };

  if (typeRecherche === "vente") {
    result.prixM2Median = Math.round(median(prixM2Values));
    result.prixM2Bas = Math.round(percentile(prixM2Values, 0.25));
    result.prixM2Haut = Math.round(percentile(prixM2Values, 0.75));
  } else {
    // Loyers souvent en €/m²/an HT pour les bureaux
    const isAnnual = prixM2Values.every((v) => v > 50);
    const divisor = isAnnual ? 12 : 1;
    result.loyerM2MensuelMedian = Math.round((median(prixM2Values) / divisor) * 100) / 100;
    result.loyerM2MensuelBas = Math.round((percentile(prixM2Values, 0.25) / divisor) * 100) / 100;
    result.loyerM2MensuelHaut = Math.round((percentile(prixM2Values, 0.75) / divisor) * 100) / 100;
  }

  return result;
}

export const bureauxLocauxScraper: Scraper = {
  name: "bureauxlocaux",

  async scrape(ctx: ScrapingContext): Promise<ScrapedResult[]> {
    // Only scrape for commercial/bureau types
    if (!["bureau", "local_commercial", "commerce"].includes(ctx.typeBien)) {
      return [];
    }

    const cacheKey = `bl:${ctx.codePostal}:${ctx.typeBien}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`BureauxLocaux: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien})`);

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
