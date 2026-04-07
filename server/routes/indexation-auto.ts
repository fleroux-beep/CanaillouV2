/**
 * Axe 2 — Routes pour l'indexation automatique INSEE + cron
 */
import type { Express } from "express";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";
import { syncIndicesINSEE, assignDefaultIndices, autoIndexBaux } from "../lib/sync-insee";

const indexationLimiter = rateLimit(5, 10 * 60 * 1000, "indexation"); // 5 per 10 min

export function registerIndexationAutoRoutes(app: Express) {
  // Sync indices from INSEE
  app.post("/api/indexation/sync-insee", requireWriteAdmin, indexationLimiter, async (_req: any, res: any) => {
    try {
      const result = await syncIndicesINSEE();
      res.json({ message: "Synchronisation INSEE terminée", ...result });
    } catch (error: any) {
      logger.error("sync-insee route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Auto-index all eligible baux
  app.post("/api/indexation/auto-index", requireWriteAdmin, indexationLimiter, async (_req: any, res: any) => {
    try {
      const result = await autoIndexBaux();
      res.json({ message: "Indexation automatique terminée", ...result });
    } catch (error: any) {
      logger.error("auto-index route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Full pipeline: sync + assign defaults + index
  app.post("/api/indexation/full-pipeline", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const syncResult = await syncIndicesINSEE();
      const assignResult = await assignDefaultIndices();
      const indexResult = await autoIndexBaux();
      res.json({
        message: "Pipeline complet terminé",
        sync: syncResult,
        assignDefaults: assignResult,
        indexation: indexResult,
      });
    } catch (error: any) {
      logger.error("full-pipeline route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
