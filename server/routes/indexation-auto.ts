/**
 * Routes pour l'indexation automatique INSEE + AM baux
 */
import type { Express } from "express";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";
import { syncIndicesINSEE, assignDefaultIndices, autoIndexBaux } from "../lib/sync-insee";
import { db } from "../db";
import { indices, bauxGL, indexationsGL } from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

const indexationLimiter = rateLimit(5, 10 * 60 * 1000, "indexation");

export function registerIndexationAutoRoutes(app: Express) {
  // GET indices for the frontend
  app.get("/api/indexation/indices", requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(indices).orderBy(desc(indices.trimestre));
      res.json(rows);
    } catch (error: any) {
      logger.error("get indices error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET AM baux with indexation data for the frontend
  app.get("/api/indexation/baux-am", requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(bauxGL)
        .where(and(eq(bauxGL.scope, "am"), eq(bauxGL.archived, false), isNull(bauxGL.deletedAt)));
      res.json(rows);
    } catch (error: any) {
      logger.error("get baux-am error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET indexation history for AM baux
  app.get("/api/indexation/historique", requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(indexationsGL).orderBy(desc(indexationsGL.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("get historique error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

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

  // Auto-index all eligible AM baux
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
