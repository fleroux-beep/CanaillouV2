import type { Express } from "express";
import { db } from "../db";
import {
  bailleurs, gestionnaires, locatairesGL, bauxGL,
  paiementsGL, facturesGL, quittancesGL, indexationsGL,
  avenantsGL, renouvellementsGL, documentsGL, indices,
} from "@shared/schema";
import { eq, desc, count, isNotNull, isNull, and } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { glSchemas } from "../lib/validation";
import { logger } from "../lib/logger";
import { registerCrud as registerCrudFactory, paramId } from "../lib/crud-factory";
import { autoIndexBaux } from "../lib/sync-insee";

export function registerGLRoutes(app: Express) {
  const opts = { prefix: "gl", schemas: glSchemas };
  registerCrudFactory(app, "bailleurs", bailleurs, opts);
  registerCrudFactory(app, "gestionnaires", gestionnaires, opts);
  registerCrudFactory(app, "locataires", locatairesGL, opts);
  registerCrudFactory(app, "baux", bauxGL, opts, { scope: "gl" });
  registerCrudFactory(app, "paiements", paiementsGL, opts);
  registerCrudFactory(app, "factures", facturesGL, opts);
  registerCrudFactory(app, "quittances", quittancesGL, opts);
  registerCrudFactory(app, "indexations", indexationsGL, opts);
  registerCrudFactory(app, "avenants", avenantsGL, opts);
  registerCrudFactory(app, "renouvellements", renouvellementsGL, opts);
  registerCrudFactory(app, "documents", documentsGL, opts);
  registerCrudFactory(app, "indices", indices, opts);

  // Custom delete for bailleurs — prevent if linked baux exist
  app.delete("/api/gl/bailleurs/:id", requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;
      const linkedBaux = await db.select({ id: bauxGL.id }).from(bauxGL)
        .where(and(eq(bauxGL.bailleurId, id), isNull(bauxGL.deletedAt)))
        .limit(1);
      if (linkedBaux.length > 0) {
        return res.status(409).json({ error: "Impossible de supprimer ce bailleur : des baux y sont encore liés" });
      }
      await db.delete(bailleurs).where(eq(bailleurs.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Get all baux for a bailleur
  app.get("/api/gl/bailleurs/:id/baux", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(bauxGL).where(
        and(eq(bauxGL.bailleurId, paramId(req)), isNull(bauxGL.deletedAt))
      );
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/gl/baux/:id/paiements", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(paiementsGL).where(eq(paiementsGL.bailId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/gl/baux/:id/indexations", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(indexationsGL).where(eq(indexationsGL.bailId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/gl/stats", requireAuth, async (_req: any, res: any) => {
    try {
      const [cntBaux, cntBailleurs, cntLocataires] = await Promise.all([
        db.select({ value: count() }).from(bauxGL).where(and(eq(bauxGL.scope, "gl"), eq(bauxGL.archived, false), isNull(bauxGL.deletedAt))),
        db.select({ value: count() }).from(bailleurs),
        db.select({ value: count() }).from(locatairesGL).where(isNull(locatairesGL.deletedAt)),
      ]);

      res.json({
        baux: cntBaux[0].value,
        bailleurs: cntBailleurs[0].value,
        locataires: cntLocataires[0].value,
      });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Automatic indexation calculation (requires admin — modifies all lease rents)
  // Delegates to the shared autoIndexBaux() in sync-insee.ts which applies the
  // legal IRL +3.5%/year cap (loi Climat) and uses tolerance-based idempotency.
  app.post("/api/gl/indexation/auto", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const result = await autoIndexBaux();
      res.json({
        count: result.indexed,
        skipped: result.skipped.map((s) => ({ bailId: s.bail, reason: s.reason })),
        errors: result.errors,
      });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
