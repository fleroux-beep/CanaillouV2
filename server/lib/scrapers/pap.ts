/**
 * Scraper PAP.fr — Annonces entre particuliers (vente et location).
 * Utilise Playwright pour le rendu JS complet.
 */
import {
  Scraper, ScrapedResult, ScrapingContext,
  fetchPage, getCached, setCache,
  median, percentile, computeTauxCapi, filterPlausiblePrixM2, slugifyVille,
} from "./base";
import { logger } from "../logger";

const DOMAIN = "www.pap.fr";

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
  const transaction = typeRecherche === "vente" ? "vente" : "location";

  const villePath = slugifyVille(ctx.ville);

  return `https://${DOMAIN}/annonces/${transaction}-${typePath}-${villePath}-${ctx.codePostal}`;
}

interface PAPListing {
  price: number;
  surface: number;
  prixM2: number;
}

function extractListings(html: string): PAPListing[] {
  const listings: PAPListing[] = [];

  // 1) Blocs d'annonces PAP (class="search-list-item" ou similaire)
  const adBlocks = html.split(/class="[^"]*search-list-item[^"]*"/gi);
  for (const block of adBlocks.slice(1)) {
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

  // 2) Fallback : JSON-LD ou __NEXT_DATA__
  if (listings.length === 0) {
    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const ads = data?.props?.pageProps?.ads || data?.props?.pageProps?.results || [];
        for (const ad of ads) {
          const price = ad.price || ad.prix || 0;
          const surface = ad.surface || ad.area || ad.living_area || 0;
          if (price > 0 && surface > 5) {
            listings.push({ price, surface, prixM2: Math.round(price / surface) });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 3) Fallback regex sur le HTML rendu
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
  logger.info(`PAP [${typeRecherche}]: URL construite → ${url}`);

  const pageResult = await fetchPage(url, {
    domain: DOMAIN,
    timeoutMs: 25000,
    waitForSelector: ".search-list-item",
  });

  if (!pageResult) {
    logger.warn(`PAP [${typeRecherche}]: fetchPage a retourné null`);
    return null;
  }

  const finalUrl = pageResult.url;
  logger.info(`PAP [${typeRecherche}]: page récupérée (${pageResult.html.length} chars), URL finale: ${finalUrl}`);

  // Détection de redirection hors recherche
  if (!finalUrl.includes("pap.fr") || finalUrl.endsWith("pap.fr/")) {
    logger.warn(`PAP [${typeRecherche}]: REDIRECTION détectée — URL finale "${finalUrl}" n'est pas une page de recherche. Résultats ignorés.`);
    return null;
  }

  const listings = extractListings(pageResult.html);
  logger.info(`PAP [${typeRecherche}]: ${listings.length} annonces extraites`);
  if (listings.length < 1) {
    logger.warn(`PAP [${typeRecherche}]: aucune annonce extraite — abandon`);
    return null;
  }

  const allPrixM2 = listings.map((l) => l.prixM2);
  const isCommercial = ["local_commercial", "bureau", "commerce"].includes(ctx.typeBien);
  const plausibility = filterPlausiblePrixM2(allPrixM2, typeRecherche, isCommercial);
  if (plausibility.reason) {
    logger.info(`PAP [${typeRecherche}]: filtre plausibilité → ${plausibility.reason}`);
  }
  logger.info(`PAP [${typeRecherche}]: ${plausibility.values.length}/${allPrixM2.length} prix/m² plausibles. ` +
    `Valeurs brutes (5 premiers): ${allPrixM2.slice(0, 5).join(", ")}`);
  if (plausibility.values.length < 1) {
    logger.warn(`PAP [${typeRecherche}]: aucun prix/m² plausible — abandon`);
    return null;
  }
  const prixM2Values = plausibility.values;

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
    const cacheKey = `pap:${ctx.codePostal}:${ctx.typeBien}:${ctx.rayonKm}`;
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
