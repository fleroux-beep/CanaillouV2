/**
 * Scraper LeBonCoin — Annonces immobilières vente et location.
 * Utilise Playwright pour charger la page et extraire les données JSON
 * injectées par le framework Next.js de LeBonCoin.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchPage, getCached, setCache,
  median, percentile, computeTauxCapi,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.leboncoin.fr";

// LeBonCoin category IDs
const CATEGORY_VENTE: Record<string, number> = {
  appartement: 9,
  maison: 9,
  local_commercial: 9,
  bureau: 9,
  commerce: 9,
};

const CATEGORY_LOCATION: Record<string, number> = {
  appartement: 10,
  maison: 10,
  local_commercial: 10,
  bureau: 10,
  commerce: 10,
};

const REAL_ESTATE_TYPE: Record<string, number[]> = {
  appartement: [1],
  maison: [2],
  local_commercial: [5, 6],
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

  const params = new URLSearchParams({
    category: String(category),
    locations: `${ctx.ville}_${ctx.codePostal}`,
    lat: String(ctx.lat),
    lng: String(ctx.lng),
    radius: String(Math.round(ctx.rayonKm * 1000)),
    sort: "time",
    order: "desc",
    limit: "50",
  });

  const reTypes = REAL_ESTATE_TYPE[ctx.typeBien];
  if (reTypes) {
    params.set("real_estate_type", reTypes.join(","));
  }

  return `https://${DOMAIN}/recherche?${params}`;
}

function extractListings(html: string): LBCListing[] {
  const listings: LBCListing[] = [];

  // 1) Extraire depuis __NEXT_DATA__ (rendu côté serveur par Next.js)
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const ads = data?.props?.pageProps?.searchData?.ads
        || data?.props?.pageProps?.ads
        || data?.props?.pageProps?.initialData?.ads
        || [];

      for (const ad of ads) {
        const price = ad.price?.[0] || ad.price || 0;
        const attributes = ad.attributes || [];
        const surfaceAttr = attributes.find((a: any) =>
          a.key === "square" || a.key === "surface" || a.key === "rooms_count",
        );
        const surface = surfaceAttr ? parseFloat(surfaceAttr.value) : 0;

        if (price > 0 && surface > 5) {
          listings.push({ price, surface, prixM2: Math.round(price / surface) });
        }
      }
    } catch { /* parse error */ }
  }

  // 2) Fallback : chercher les données dans des blocs JSON intégrés
  if (listings.length === 0) {
    // LeBonCoin peut intégrer les données dans un state Redux/Zustand sérialisé
    const stateMatch = html.match(/window\.__STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/i);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const ads = state?.ads?.data || state?.search?.ads || [];
        for (const ad of ads) {
          const price = ad.price?.[0] || ad.price || 0;
          const surface = ad.attributes?.find((a: any) => a.key === "square")?.value || 0;
          if (price > 0 && Number(surface) > 5) {
            listings.push({ price, surface: Number(surface), prixM2: Math.round(price / Number(surface)) });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 3) Dernier fallback : regex sur le HTML rendu
  if (listings.length === 0) {
    const priceMatches = [...html.matchAll(/(?:data-test-id="price"|class="[^"]*price[^"]*")[^>]*>([\d\s.,]+)\s*€/gi)];
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

async function scrapeLBCType(
  ctx: ScrapingContext,
  typeRecherche: "vente" | "location",
): Promise<ScrapedResult | null> {
  const url = buildSearchUrl(ctx, typeRecherche);
  logger.info(`LeBonCoin [${typeRecherche}]: URL construite → ${url}`);

  // Playwright : charge la page avec rendu JS complet
  const pageResult = await fetchPage(url, {
    domain: DOMAIN,
    timeoutMs: 25000,
    waitForSelector: "[data-test-id='adcard']",
  });

  if (!pageResult) {
    logger.warn(`LeBonCoin [${typeRecherche}]: fetchPage a retourné null (Playwright échoué ou navigateur indisponible)`);
    return null;
  }

  logger.info(`LeBonCoin [${typeRecherche}]: page récupérée (${pageResult.html.length} chars), URL finale: ${pageResult.url}`);

  const listings = extractListings(pageResult.html);
  logger.info(`LeBonCoin [${typeRecherche}]: ${listings.length} annonces extraites du HTML`);
  if (listings.length < 1) {
    logger.warn(`LeBonCoin [${typeRecherche}]: aucune annonce extraite — abandon`);
    return null;
  }

  const allPrixM2 = listings.map((l) => l.prixM2);
  const prixM2Values = allPrixM2.filter((v) => v > 50 && v < 100000);
  logger.info(`LeBonCoin [${typeRecherche}]: ${prixM2Values.length}/${allPrixM2.length} prix/m² passent le filtre [50-100000]. ` +
    `Valeurs brutes (5 premiers): ${allPrixM2.slice(0, 5).join(", ")}`);
  if (prixM2Values.length < 1) {
    logger.warn(`LeBonCoin [${typeRecherche}]: aucun prix/m² dans la plage valide — abandon`);
    return null;
  }

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
    const cacheKey = `lbc:${ctx.codePostal}:${ctx.typeBien}:${ctx.rayonKm}`;
    const cached = getCached<ScrapedResult[]>(cacheKey);
    if (cached) return cached;

    logger.info(`LeBonCoin: scraping ${ctx.ville} ${ctx.codePostal} (${ctx.typeBien}, ${ctx.rayonKm}km)`);

    const results: ScrapedResult[] = [];

    const vente = await scrapeLBCType(ctx, "vente");
    if (vente) results.push(vente);

    const location = await scrapeLBCType(ctx, "location");
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
