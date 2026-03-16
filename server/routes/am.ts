import type { Express } from "express";
import { db } from "../db";
import { scis, associes, participations, actifs, lots, locatairesAM, bauxAM, emprunts, travaux, documentsAM } from "@shared/schema";
import { eq, desc, count, isNull, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { validate, amSchemas } from "../lib/validation";
import { logger } from "../lib/logger";

function paramId(req: any): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

// Generic CRUD factory with Zod validation
function registerCrud(app: Express, path: string, table: any) {
  const schema = amSchemas[path];

  app.get(`/api/am/${path}`, requireAuth, async (_req: any, res: any) => {
    try {
      const hasDeletedAt = "deletedAt" in table;
      const rows = hasDeletedAt
        ? await db.select().from(table).where(isNull(table.deletedAt)).orderBy(desc(table.createdAt))
        : await db.select().from(table).orderBy(desc(table.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get(`/api/am/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(table).where(eq(table.id, paramId(req))).limit(1) as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.post(`/api/am/${path}`, requireAuth, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.patch(`/api/am/${path}/:id`, requireAuth, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
    try {
      const updateData = "updatedAt" in table
        ? { ...req.body, updatedAt: new Date() }
        : req.body;
      const rows = await db
        .update(table)
        .set(updateData)
        .where(eq(table.id, paramId(req)))
        .returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.delete(`/api/am/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const hasDeletedAt = "deletedAt" in table;
      if (hasDeletedAt) {
        await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, paramId(req)));
      } else {
        await db.delete(table).where(eq(table.id, paramId(req)));
      }
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}

export function registerAMRoutes(app: Express) {
  registerCrud(app, "scis", scis);
  registerCrud(app, "associes", associes);
  registerCrud(app, "participations", participations);
  registerCrud(app, "actifs", actifs);
  registerCrud(app, "lots", lots);
  registerCrud(app, "locataires", locatairesAM);
  registerCrud(app, "baux", bauxAM);
  registerCrud(app, "emprunts", emprunts);
  registerCrud(app, "travaux", travaux);
  registerCrud(app, "documents", documentsAM);

  // === Custom endpoints ===

  app.get("/api/am/actifs/:id/lots", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(lots).where(eq(lots.actifId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/scis/:id/actifs", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(actifs).where(eq(actifs.sciId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/scis/:id/emprunts", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(emprunts).where(eq(emprunts.sciId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/lots/:id/baux", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(bauxAM).where(eq(bauxAM.lotId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/scis/:id/participations", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(participations).where(eq(participations.sciId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/stats", requireAuth, async (_req: any, res: any) => {
    try {
      const [cntScis, cntActifs, cntLots, cntBaux, cntEmprunts, cntLocataires, cntAssocies] =
        await Promise.all([
          db.select({ value: count() }).from(scis),
          db.select({ value: count() }).from(actifs).where(eq(actifs.archived, false)),
          db.select({ value: count() }).from(lots).where(eq(lots.archived, false)),
          db.select({ value: count() }).from(bauxAM).where(eq(bauxAM.archived, false)),
          db.select({ value: count() }).from(emprunts).where(eq(emprunts.archived, false)),
          db.select({ value: count() }).from(locatairesAM),
          db.select({ value: count() }).from(associes),
        ]);

      res.json({
        scis: cntScis[0].value,
        actifs: cntActifs[0].value,
        lots: cntLots[0].value,
        baux: cntBaux[0].value,
        emprunts: cntEmprunts[0].value,
        locataires: cntLocataires[0].value,
        associes: cntAssocies[0].value,
      });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
