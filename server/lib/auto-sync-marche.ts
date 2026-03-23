/**
 * Synchronisation automatique des données de marché.
 *
 * - Au démarrage du serveur (après un délai de 30s pour laisser le temps à l'init)
 * - Puis toutes les semaines (les données DVF/ANIL changent rarement)
 *
 * Enchaîne automatiquement :
 *  1. Sync DVF (valeurs vénales)
 *  2. Sync ANIL (valeurs locatives)
 *  3. Calcul des taux de capitalisation
 */
import { db } from "../db";
import { actifs, refValeursVenales, refValeursLocatives } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { syncDVF } from "./sync-dvf";
import { syncANIL } from "./sync-anil";
import { computeTauxCapiFromRefs } from "./compute-taux-capi";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
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
 * Lance la synchronisation complète : DVF → ANIL → taux de capi.
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

  logger.info("auto-sync: synchronisation complète terminée");
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

  // Schedule weekly re-sync
  setInterval(async () => {
    try {
      logger.info("auto-sync: sync hebdomadaire programmée");
      await runFullSync();
    } catch (err: any) {
      logger.error("auto-sync: weekly sync failed", { error: err.message });
    }
  }, ONE_WEEK_MS);

  logger.info("auto-sync: planifié — sync initiale dans 30s, puis toutes les semaines");
}
