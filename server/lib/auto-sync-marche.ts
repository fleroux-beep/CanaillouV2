/**
 * Synchronisation automatique des données de marché.
 *
 * - Au démarrage du serveur (si données absentes ou périmées)
 * - Tous les jours à 5h00, heure de Paris (Europe/Paris)
 *
 * Enchaîne automatiquement :
 *  1. Sync DVF (valeurs vénales)
 *  2. Sync ANIL (valeurs locatives)
 *  3. Calcul des taux de capitalisation
 *  4. Scraping Phase 2 (plateformes immobilières)
 */
import { db } from "../db";
import { actifs, refValeursVenales, refValeursLocatives } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { syncDVF } from "./sync-dvf";
import { syncANIL } from "./sync-anil";
import { computeTauxCapiFromRefs } from "./compute-taux-capi";
import { scrapeAllActifs } from "./scrapers";
import { syncIndicesINSEE, autoIndexBaux } from "./sync-insee";
import { computeAndStoreAlerts } from "../routes/alertes-proactives";

const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after server starts

/**
 * Récupère les paires (codePostal, ville) des actifs actifs.
 */
async function getActifPairs(): Promise<{ codePostal: string; ville: string }[]> {
  const rows = await db
    .select({ codePostal: actifs.codePostal, ville: actifs.ville })
    .from(actifs)
    .where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));

  const pairMap = new Map<string, string>();
  for (const a of rows) {
    if (a.codePostal && a.ville) pairMap.set(a.codePostal, a.ville);
  }
  return [...pairMap.entries()].map(([codePostal, ville]) => ({ codePostal, ville }));
}

/**
 * Vérifie si les données de marché sont vides ou périmées (> 30 jours).
 */
async function isStale(): Promise<boolean> {
  const venales = await db.select().from(refValeursVenales).limit(1);
  if (venales.length === 0) return true;

  const locatives = await db.select().from(refValeursLocatives).limit(1);
  if (locatives.length === 0) return true;

  // Check if most recent dateReleve is older than 30 days
  const recent = venales[0].dateReleve;
  if (!recent) return true;

  const lastSync = new Date(recent).getTime();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return lastSync < thirtyDaysAgo;
}

/**
 * Lance la synchronisation complète : DVF → ANIL → taux de capi → scraping.
 */
async function runFullSync(): Promise<void> {
  const pairs = await getActifPairs();
  if (pairs.length === 0) {
    logger.info("auto-sync: aucun actif avec code postal — skip");
    return;
  }

  logger.info("auto-sync: démarrage synchronisation données de marché", {
    nbActifs: pairs.length,
  });

  // 1. Sync DVF
  try {
    const dvfResult = await syncDVF(pairs);
    logger.info("auto-sync: DVF terminé", {
      synced: dvfResult.synced,
      errors: dvfResult.errors.length,
    });
    if (dvfResult.errors.length > 0) {
      logger.warn("auto-sync: DVF errors", { errors: dvfResult.errors.slice(0, 5) });
    }
  } catch (err: any) {
    logger.error("auto-sync: DVF failed", { error: err.message });
  }

  // 2. Sync ANIL
  try {
    const anilResult = await syncANIL(pairs);
    logger.info("auto-sync: ANIL terminé", {
      synced: anilResult.synced,
      errors: anilResult.errors.length,
    });
    if (anilResult.errors.length > 0) {
      logger.warn("auto-sync: ANIL errors", { errors: anilResult.errors.slice(0, 5) });
    }
  } catch (err: any) {
    logger.error("auto-sync: ANIL failed", { error: err.message });
  }

  // 3. Calcul taux de capitalisation
  try {
    const capiResult = await computeTauxCapiFromRefs();
    logger.info("auto-sync: taux de capitalisation calculés", {
      computed: capiResult.computed,
      errors: capiResult.errors.length,
    });
  } catch (err: any) {
    logger.error("auto-sync: compute taux capi failed", { error: err.message });
  }

  // 4. Scraping Phase 2 (plateformes immobilières)
  try {
    logger.info("auto-sync: lancement scraping Phase 2");
    const scrapingResult = await scrapeAllActifs();
    logger.info("auto-sync: scraping Phase 2 terminé", {
      total: scrapingResult.total,
      scraped: scrapingResult.scraped,
      errors: scrapingResult.errors.length,
    });
    if (scrapingResult.errors.length > 0) {
      logger.warn("auto-sync: scraping errors", { errors: scrapingResult.errors.slice(0, 10) });
    }
  } catch (err: any) {
    logger.error("auto-sync: scraping Phase 2 failed", { error: err.message });
  }

  // 5. Sync indices INSEE
  try {
    logger.info("auto-sync: sync indices INSEE");
    const inseeResult = await syncIndicesINSEE();
    logger.info("auto-sync: indices INSEE terminé", { synced: inseeResult.synced });
  } catch (err: any) {
    logger.error("auto-sync: sync INSEE failed", { error: err.message });
  }

  // 6. Auto-indexation des baux GL
  try {
    logger.info("auto-sync: indexation automatique baux GL");
    const indexResult = await autoIndexBaux();
    logger.info("auto-sync: indexation terminée", { indexed: indexResult.indexed });
  } catch (err: any) {
    logger.error("auto-sync: auto-index baux failed", { error: err.message });
  }

  // 7. Recalcul alertes proactives
  try {
    logger.info("auto-sync: recalcul alertes proactives");
    const alertResult = await computeAndStoreAlerts();
    logger.info("auto-sync: alertes recalculées", alertResult);
  } catch (err: any) {
    logger.error("auto-sync: alertes failed", { error: err.message });
  }

  logger.info("auto-sync: synchronisation complète terminée (Phase 1 + Phase 2 + INSEE + Alertes)");
}

/**
 * Calcule le délai en ms jusqu'au prochain 5h00 heure de Paris.
 */
function msUntilNext5amParis(): number {
  // Formatter qui donne l'heure de Paris
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || "0");

  const parisHour = get("hour");
  const parisMinute = get("minute");
  const parisSecond = get("second");

  // Nombre de secondes depuis minuit Paris
  const secSinceMidnight = parisHour * 3600 + parisMinute * 60 + parisSecond;
  const targetSec = 5 * 3600; // 5h00 = 18000s

  // Si on est avant 5h, on attend jusqu'à 5h aujourd'hui
  // Si on est après 5h, on attend jusqu'à 5h demain
  let delaySec = targetSec - secSinceMidnight;
  if (delaySec <= 0) {
    delaySec += 24 * 3600; // demain
  }

  return delaySec * 1000;
}

/**
 * Planifie la prochaine exécution à 5h Paris et relance la planification après.
 */
function scheduleDailySync(): void {
  const delayMs = msUntilNext5amParis();
  const delayH = (delayMs / 3600000).toFixed(1);
  logger.info(`auto-sync: prochaine sync dans ${delayH}h (5h00 heure de Paris)`);

  setTimeout(async () => {
    try {
      logger.info("auto-sync: sync quotidienne 5h00 Paris — démarrage");
      await runFullSync();
    } catch (err: any) {
      logger.error("auto-sync: daily sync failed", { error: err.message });
    }
    // Re-planifier pour demain
    scheduleDailySync();
  }, delayMs);
}

/**
 * Initialise la synchronisation automatique.
 * Appelée une fois au démarrage du serveur.
 */
export function startAutoSync(): void {
  // Run once at startup (with delay), but only if data is stale or empty
  setTimeout(async () => {
    try {
      if (await isStale()) {
        logger.info("auto-sync: données de marché absentes ou périmées — lancement sync");
        await runFullSync();
      } else {
        logger.info("auto-sync: données de marché à jour — skip sync initial");
      }
    } catch (err: any) {
      logger.error("auto-sync: startup sync failed", { error: err.message });
    }
  }, STARTUP_DELAY_MS);

  // Schedule daily sync at 5:00 AM Paris time
  scheduleDailySync();
}
