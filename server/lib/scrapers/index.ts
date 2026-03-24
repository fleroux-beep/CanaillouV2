/**
 * Orchestrateur de scraping — lance tous les scrapers pour un actif donné
 * et stocke les résultats en base.
 */
import { db } from "../../db";
import { refMarcheScraping, actifs, refValeursVenales, refValeursLocatives, refTauxCapitalisation } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "../logger";
import type { ScrapingContext, ScrapedResult, Scraper } from "./base";
import { mapActifTypeToSearch, ensureBrowserChecked } from "./base";
import { analyserPhase2 } from "./analyse-marche";

// Import scrapers
import { meilleursAgentsScraper } from "./meilleursagents";
import { leboncoinScraper } from "./leboncoin";
import { selogerScraper } from "./seloger";
import { papScraper } from "./pap";
import { selogerBCScraper } from "./seloger-bc";
import { bureauxLocauxScraper } from "./bureauxlocaux";

const ALL_SCRAPERS: Scraper[] = [
  meilleursAgentsScraper,
  leboncoinScraper,
  selogerScraper,
  papScraper,
  selogerBCScraper,
  bureauxLocauxScraper,
];

const RAYON_KM = 5;          // rayon initial 5 km
const RAYON_FALLBACK_KM = 10; // rayon élargi si aucun résultat au premier passage

/**
 * Exécute tous les scrapers avec un contexte donné.
 * Retourne le nombre de résultats insérés et les erreurs.
 */
async function runScrapers(
  actifId: string,
  ctx: ScrapingContext,
  now: string,
): Promise<{ results: number; errors: string[] }> {
  let totalResults = 0;
  const errors: string[] = [];

  for (const scraper of ALL_SCRAPERS) {
    try {
      const scraperResults = await scraper.scrape(ctx);

      for (const r of scraperResults) {
        await db.insert(refMarcheScraping).values({
          actifId,
          source: r.source,
          typeRecherche: r.typeRecherche,
          typeBien: r.typeBien,
          prixM2Median: r.prixM2Median != null ? String(r.prixM2Median) : null,
          prixM2Bas: r.prixM2Bas != null ? String(r.prixM2Bas) : null,
          prixM2Haut: r.prixM2Haut != null ? String(r.prixM2Haut) : null,
          loyerM2MensuelMedian: r.loyerM2MensuelMedian != null ? String(r.loyerM2MensuelMedian) : null,
          loyerM2MensuelBas: r.loyerM2MensuelBas != null ? String(r.loyerM2MensuelBas) : null,
          loyerM2MensuelHaut: r.loyerM2MensuelHaut != null ? String(r.loyerM2MensuelHaut) : null,
          nbAnnonces: r.nbAnnonces || null,
          rayonKm: String(ctx.rayonKm),
          lat: ctx.lat,
          lng: ctx.lng,
          codePostal: ctx.codePostal,
          ville: ctx.ville,
          tauxCapiDeduit: r.tauxCapiDeduit != null ? String(r.tauxCapiDeduit) : null,
          dateReleve: now,
          rawData: r.rawData || null,
          notes: r.notes || null,
        });
        totalResults++;
      }
    } catch (err: any) {
      const msg = `${scraper.name}: ${err.message}`;
      errors.push(msg);
      logger.warn(`Scraper error for ${actifId}`, { scraper: scraper.name, error: err.message });
    }
  }

  return { results: totalResults, errors };
}

/**
 * Lance le scraping pour un actif donné et stocke les résultats.
 * Essaie d'abord avec RAYON_KM, puis élargit à RAYON_FALLBACK_KM si aucun résultat.
 */
export async function scrapeForActif(actif: {
  id: string;
  lat: number | null;
  lng: number | null;
  codePostal: string | null;
  ville: string | null;
  type: string | null;
  surface: string | null;
}): Promise<{ results: number; errors: string[] }> {
  if (!actif.lat || !actif.lng || !actif.codePostal || !actif.ville) {
    return { results: 0, errors: ["Actif sans coordonnées GPS ou code postal"] };
  }

  const { typeBien } = mapActifTypeToSearch(actif.type || "résidentiel");
  const now = new Date().toISOString().slice(0, 10);

  const baseCtx: ScrapingContext = {
    lat: actif.lat,
    lng: actif.lng,
    codePostal: actif.codePostal,
    ville: actif.ville,
    typeBien,
    rayonKm: RAYON_KM,
    surface: actif.surface ? Number(actif.surface) : undefined,
  };

  // Delete existing scraped data for this actif
  await db.delete(refMarcheScraping).where(eq(refMarcheScraping.actifId, actif.id));

  // Premier essai avec le rayon par défaut (5 km)
  let result = await runScrapers(actif.id, baseCtx, now);

  // Si aucun résultat, élargir au rayon de fallback (10 km)
  if (result.results === 0) {
    logger.info(`Scraping: 0 résultats à ${RAYON_KM}km pour ${actif.ville} — élargissement à ${RAYON_FALLBACK_KM}km`);
    result = await runScrapers(actif.id, { ...baseCtx, rayonKm: RAYON_FALLBACK_KM }, now);
  }

  return result;
}

/**
 * Lance le scraping global pour tous les actifs actifs.
 */
export async function scrapeAllActifs(): Promise<{
  total: number;
  scraped: number;
  errors: string[];
}> {
  // Vérifier dès le début si le navigateur est disponible — éviter 11×6 appels inutiles
  const hasBrowser = await ensureBrowserChecked();
  if (!hasBrowser) {
    logger.warn("scrapeAllActifs: Chromium indisponible — scraping Phase 2 ignoré");
    return { total: 0, scraped: 0, errors: ["Chromium non disponible — installez chromium ou définissez CHROMIUM_PATH"] };
  }

  const allActifs = await db
    .select({
      id: actifs.id,
      nom: actifs.nom,
      lat: actifs.lat,
      lng: actifs.lng,
      codePostal: actifs.codePostal,
      ville: actifs.ville,
      type: actifs.type,
      surface: actifs.surface,
    })
    .from(actifs)
    .where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));

  let scraped = 0;
  const allErrors: string[] = [];

  for (const actif of allActifs) {
    logger.info(`Scraping market data for: ${actif.nom} (${actif.ville} ${actif.codePostal})`);
    const { results, errors } = await scrapeForActif(actif);
    scraped += results;
    allErrors.push(...errors.map((e) => `${actif.nom}: ${e}`));
  }

  return { total: allActifs.length, scraped, errors: allErrors };
}

/**
 * Récupère les données d'étude de marché par actif (Phase 1 + Phase 2).
 */
export async function getEtudeMarche(actifId?: string) {
  // Get actifs
  const query = actifId
    ? db.select().from(actifs).where(and(eq(actifs.id, actifId), isNull(actifs.deletedAt)))
    : db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));

  const allActifs = await query;

  // Get all reference data
  const venales = await db.select().from(refValeursVenales);
  const locatives = await db.select().from(refValeursLocatives);
  const tauxCapi = await db.select().from(refTauxCapitalisation);
  const scraping = await db.select().from(refMarcheScraping);

  // Build per-actif data
  return allActifs.map((actif) => {
    const cp = actif.codePostal || "";
    const { typeBien, dvfCompatible, anilCompatible } = mapActifTypeToSearch(actif.type || "résidentiel");

    // Phase 1: données officielles (DVF + ANIL)
    // Ne retourner des données QUE si le type d'actif est compatible avec la source.
    // Pour les crèches et bureaux, on préfère "pas de données" à de fausses estimations.
    const venalesDVF = dvfCompatible
      ? venales.filter((v) => v.codePostal === cp && v.typeBien === typeBien && v.source === "dvf")
      : [];
    const locativesANIL = anilCompatible
      ? locatives.filter((l) => l.codePostal === cp && l.typeBien === typeBien && l.source === "anil")
      : [];
    const tauxCalc = (dvfCompatible && anilCompatible)
      ? tauxCapi.filter((t) => t.codePostal === cp && t.typeBien === typeBien && t.source === "calculé")
      : [];

    // Phase 2: données scrapées
    const scrapedData = scraping.filter((s) => s.actifId === actif.id);
    const scrapedVente = scrapedData.filter((s) => s.typeRecherche === "vente");
    const scrapedLocation = scrapedData.filter((s) => s.typeRecherche === "location");

    // Phase 1 values for analysis context
    const p1PrixM2 = venalesDVF[0] ? Number(venalesDVF[0].prixM2Median) : null;
    const p1LoyerM2 = locativesANIL[0] ? Number(locativesANIL[0].loyerM2MensuelMedian) : null;
    const p1TauxCapi = tauxCalc[0] ? Number(tauxCalc[0].tauxCapi) : null;

    // Analyse intelligente Phase 2
    const analyse = analyserPhase2(scrapedVente, scrapedLocation, {
      typeActif: actif.type || "résidentiel",
      typeBien,
      p1PrixM2,
      p1LoyerM2,
      p1TauxCapi,
      p1Fiabilite: tauxCalc[0]?.fiabilite || null,
    });

    // Avertissements pour les types d'actifs sans données fiables
    const avertissements: string[] = [];
    if (!dvfCompatible) {
      avertissements.push(`Pas de données DVF disponibles pour le type "${actif.type}" — les prix de vente DVF ne sont pas applicables à ce type d'actif.`);
    }
    if (!anilCompatible) {
      avertissements.push(`Pas de données ANIL disponibles pour le type "${actif.type}" — la carte des loyers ANIL ne couvre que le résidentiel.`);
    }

    return {
      actif: {
        id: actif.id,
        nom: actif.nom,
        adresse: actif.adresse,
        ville: actif.ville,
        codePostal: actif.codePostal,
        type: actif.type,
        surface: actif.surface,
        surfaceCarrez: actif.surfaceCarrez,
        lat: actif.lat,
        lng: actif.lng,
        // Valeurs manuelles pour comparaison
        tauxCapitalisation: actif.tauxCapitalisation,
        prixM2Marche: actif.prixM2Marche,
      },
      avertissements,
      phase1: {
        valeurVenale: venalesDVF[0]
          ? {
              prixM2Median: Number(venalesDVF[0].prixM2Median),
              prixM2Bas: Number(venalesDVF[0].prixM2Bas),
              prixM2Haut: Number(venalesDVF[0].prixM2Haut),
              nbTransactions: venalesDVF[0].nbTransactions,
              periode: venalesDVF[0].periode,
              source: "DVF",
            }
          : null,
        valeurLocative: locativesANIL[0]
          ? {
              loyerM2Median: Number(locativesANIL[0].loyerM2MensuelMedian),
              loyerM2Bas: Number(locativesANIL[0].loyerM2MensuelBas),
              loyerM2Haut: Number(locativesANIL[0].loyerM2MensuelHaut),
              periode: locativesANIL[0].periode,
              source: "ANIL",
            }
          : null,
        tauxCapi: tauxCalc[0]
          ? {
              taux: Number(tauxCalc[0].tauxCapi),
              tauxBas: Number(tauxCalc[0].tauxCapiBas),
              tauxHaut: Number(tauxCalc[0].tauxCapiHaut),
              fiabilite: tauxCalc[0].fiabilite,
              methode: tauxCalc[0].methodeCalcul,
            }
          : null,
      },
      phase2: {
        vente: scrapedVente.map((s) => ({
          source: s.source,
          prixM2Median: s.prixM2Median ? Number(s.prixM2Median) : null,
          prixM2Bas: s.prixM2Bas ? Number(s.prixM2Bas) : null,
          prixM2Haut: s.prixM2Haut ? Number(s.prixM2Haut) : null,
          nbAnnonces: s.nbAnnonces,
          tauxCapiDeduit: s.tauxCapiDeduit ? Number(s.tauxCapiDeduit) : null,
          notes: s.notes,
          dateReleve: s.dateReleve,
        })),
        location: scrapedLocation.map((s) => ({
          source: s.source,
          loyerM2Median: s.loyerM2MensuelMedian ? Number(s.loyerM2MensuelMedian) : null,
          loyerM2Bas: s.loyerM2MensuelBas ? Number(s.loyerM2MensuelBas) : null,
          loyerM2Haut: s.loyerM2MensuelHaut ? Number(s.loyerM2MensuelHaut) : null,
          nbAnnonces: s.nbAnnonces,
          tauxCapiDeduit: s.tauxCapiDeduit ? Number(s.tauxCapiDeduit) : null,
          notes: s.notes,
          dateReleve: s.dateReleve,
        })),
        tauxCapiMoyen: analyse.tauxCapiConsolide,
        dateReleve: scrapedData[0]?.dateReleve || null,
      },
      // Analyse intelligente Phase 2
      analyse: {
        vente: analyse.vente ? {
          valeurConsolidee: analyse.vente.valeurConsolidee,
          valeurBasse: analyse.vente.valeurBasse,
          valeurHaute: analyse.vente.valeurHaute,
          nbSources: analyse.vente.nbSources,
          nbAnnoncesTotal: analyse.vente.nbAnnoncesTotal,
          scoreConfiance: analyse.vente.scoreConfiance,
          noteConfiance: analyse.vente.noteConfiance,
          explicationConfiance: analyse.vente.explicationConfiance,
          sources: analyse.vente.sources,
        } : null,
        location: analyse.location ? {
          valeurConsolidee: analyse.location.valeurConsolidee,
          valeurBasse: analyse.location.valeurBasse,
          valeurHaute: analyse.location.valeurHaute,
          nbSources: analyse.location.nbSources,
          nbAnnoncesTotal: analyse.location.nbAnnoncesTotal,
          scoreConfiance: analyse.location.scoreConfiance,
          noteConfiance: analyse.location.noteConfiance,
          explicationConfiance: analyse.location.explicationConfiance,
          sources: analyse.location.sources,
        } : null,
        tauxCapiConsolide: analyse.tauxCapiConsolide,
        tauxCapiConfiance: analyse.tauxCapiConfiance,
        tauxCapiNote: analyse.tauxCapiNote,
      },
    };
  });
}
