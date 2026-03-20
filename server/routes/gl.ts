import type { Express } from "express";
import { db } from "../db";
import {
  bailleurs, gestionnaires, locatairesGL, bauxGL,
  paiementsGL, facturesGL, quittancesGL, indexationsGL,
  avenantsGL, renouvellementsGL, documentsGL, indices,
} from "@shared/schema";
import { eq, desc, count, isNotNull, isNull, and } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate, glSchemas } from "../lib/validation";
import { logger } from "../lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramId(req: any, res?: any): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (res && !UUID_RE.test(id)) {
    res.status(400).json({ error: "ID invalide" });
    return "";
  }
  return id;
}

function registerCrud(app: Express, path: string, table: any) {
  const schema = glSchemas[path];

  app.get(`/api/gl/${path}`, requireAuth, async (_req: any, res: any) => {
    try {
      const hasDeletedAt = "deletedAt" in table;
      const rows = hasDeletedAt
        ? await db.select().from(table).where(isNull(table.deletedAt)).orderBy(desc(table.createdAt))
        : await db.select().from(table).orderBy(desc(table.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { path, error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur interne: ${error.message}` });
    }
  });

  app.get(`/api/gl/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(table).where(eq(table.id, paramId(req))).limit(1) as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.post(`/api/gl/${path}`, requireWriteAdmin, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.patch(`/api/gl/${path}/:id`, requireWriteAdmin, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
    try {
      const updateData = table.updatedAt
        ? { ...req.body, updatedAt: new Date() }
        : req.body;
      const rows = await db.update(table).set(updateData).where(eq(table.id, paramId(req))).returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.delete(`/api/gl/${path}/:id`, requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = paramId(req);

      // Prevent deleting a bailleur that still has linked baux
      if (path === "bailleurs") {
        const linkedBaux = await db.select({ id: bauxGL.id }).from(bauxGL)
          .where(and(eq(bauxGL.bailleurId, id), isNull(bauxGL.deletedAt)))
          .limit(1);
        if (linkedBaux.length > 0) {
          return res.status(409).json({ error: "Impossible de supprimer ce bailleur : des baux y sont encore liés" });
        }
      }

      const hasDeletedAt = "deletedAt" in table;
      if (hasDeletedAt) {
        await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, id));
      } else {
        await db.delete(table).where(eq(table.id, id));
      }
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}

export function registerGLRoutes(app: Express) {
  registerCrud(app, "bailleurs", bailleurs);
  registerCrud(app, "gestionnaires", gestionnaires);
  registerCrud(app, "locataires", locatairesGL);
  registerCrud(app, "baux", bauxGL);
  registerCrud(app, "paiements", paiementsGL);
  registerCrud(app, "factures", facturesGL);
  registerCrud(app, "quittances", quittancesGL);
  registerCrud(app, "indexations", indexationsGL);
  registerCrud(app, "avenants", avenantsGL);
  registerCrud(app, "renouvellements", renouvellementsGL);
  registerCrud(app, "documents", documentsGL);
  registerCrud(app, "indices", indices);

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
        db.select({ value: count() }).from(bauxGL).where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt))),
        db.select({ value: count() }).from(bailleurs),
        db.select({ value: count() }).from(locatairesGL),
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

  // Automatic indexation calculation
  app.post("/api/gl/indexation/auto", requireAuth, async (_req: any, res: any) => {
    try {
      // Fetch all baux that have an indiceReference set and are not manually forced
      const allBaux = await db
        .select()
        .from(bauxGL)
        .where(and(isNotNull(bauxGL.indiceReference), eq(bauxGL.forceManual, false)));

      // Pre-fetch latest index for each type to avoid N+1
      const allIndices = await db
        .select()
        .from(indices)
        .orderBy(desc(indices.trimestre));
      const latestByType: Record<string, { valeur: string; trimestre: string }> = {};
      for (const idx of allIndices) {
        if (!latestByType[idx.type]) {
          latestByType[idx.type] = { valeur: idx.valeur, trimestre: idx.trimestre };
        }
      }

      // Pre-fetch existing indexations to check for duplicates
      const existingIndexations = await db
        .select()
        .from(indexationsGL)
        .orderBy(desc(indexationsGL.dateApplication));
      const lastIndexByBail: Record<string, string> = {};
      for (const ix of existingIndexations) {
        if (!lastIndexByBail[ix.bailId]) {
          lastIndexByBail[ix.bailId] = ix.indiceNouveau || "";
        }
      }

      const results: any[] = [];
      const skipped: any[] = [];

      for (const bail of allBaux) {
        if (!bail.indiceReference || !bail.valeurIndiceBase || !bail.loyerBaseHT) {
          skipped.push({ bailId: bail.id, reason: "Champs manquants (indice, valeur base ou loyer)" });
          continue;
        }

        const latest = latestByType[bail.indiceReference];
        if (!latest) {
          skipped.push({ bailId: bail.id, reason: `Aucun indice ${bail.indiceReference} en base` });
          continue;
        }

        const indiceBase = parseFloat(bail.valeurIndiceBase);
        const indiceNouveau = parseFloat(latest.valeur);
        const loyerBaseHT = parseFloat(bail.loyerBaseHT);

        if (indiceBase <= 0 || isNaN(indiceBase)) {
          skipped.push({ bailId: bail.id, reason: "Valeur indice de base invalide" });
          continue;
        }

        // Idempotency: skip if already indexed with this exact index value
        const lastIdx = lastIndexByBail[bail.id];
        if (lastIdx && parseFloat(lastIdx) === indiceNouveau) {
          skipped.push({ bailId: bail.id, reason: `Déjà indexé avec indice ${indiceNouveau}` });
          continue;
        }

        const nouveauLoyer = loyerBaseHT * (indiceNouveau / indiceBase);
        const tauxVariation = ((indiceNouveau - indiceBase) / indiceBase) * 100;
        const ancienLoyer = bail.loyerHTActu ? parseFloat(bail.loyerHTActu) : loyerBaseHT;

        // Create indexation record with the index trimestre as dateApplication
        const [indexation] = await db
          .insert(indexationsGL)
          .values({
            bailId: bail.id,
            dateApplication: latest.trimestre,
            ancienLoyer: ancienLoyer.toFixed(2),
            nouveauLoyer: nouveauLoyer.toFixed(2),
            indiceBase: indiceBase.toFixed(2),
            indiceNouveau: indiceNouveau.toFixed(2),
            typeIndice: bail.indiceReference,
            tauxVariation: tauxVariation.toFixed(2),
          })
          .returning();

        // Update the bail's current rent
        await db
          .update(bauxGL)
          .set({ loyerHTActu: nouveauLoyer.toFixed(2), updatedAt: new Date() })
          .where(eq(bauxGL.id, bail.id));

        results.push({ bailId: bail.id, ancienLoyer, nouveauLoyer: parseFloat(nouveauLoyer.toFixed(2)), indexation });
      }

      res.json({ count: results.length, results, skipped });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
