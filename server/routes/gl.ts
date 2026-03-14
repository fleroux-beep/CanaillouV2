import type { Express } from "express";
import { db } from "../db";
import {
  bailleurs, gestionnaires, locatairesGL, bauxGL,
  paiementsGL, facturesGL, quittancesGL, indexationsGL,
  avenantsGL, renouvellementsGL, documentsGL, indices,
} from "@shared/schema";
import { eq, desc, count, isNotNull, isNull, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { validate, glSchemas } from "../lib/validation";

function paramId(req: any): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get(`/api/gl/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(table).where(eq(table.id, paramId(req))).limit(1) as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(`/api/gl/${path}`, requireAuth, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch(`/api/gl/${path}/:id`, requireAuth, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
    try {
      const updateData = table.updatedAt
        ? { ...req.body, updatedAt: new Date() }
        : req.body;
      const rows = await db.update(table).set(updateData).where(eq(table.id, paramId(req))).returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete(`/api/gl/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const hasDeletedAt = "deletedAt" in table;
      if (hasDeletedAt) {
        await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, paramId(req)));
      } else {
        await db.delete(table).where(eq(table.id, paramId(req)));
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      const rows = await db.select().from(bauxGL).where(eq(bauxGL.bailleurId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gl/baux/:id/paiements", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(paiementsGL).where(eq(paiementsGL.bailId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gl/baux/:id/indexations", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(indexationsGL).where(eq(indexationsGL.bailId, paramId(req)));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gl/stats", requireAuth, async (_req: any, res: any) => {
    try {
      const [cntBaux, cntBailleurs, cntLocataires] = await Promise.all([
        db.select({ value: count() }).from(bauxGL).where(eq(bauxGL.archived, false)),
        db.select({ value: count() }).from(bailleurs),
        db.select({ value: count() }).from(locatairesGL),
      ]);

      res.json({
        baux: cntBaux[0].value,
        bailleurs: cntBailleurs[0].value,
        locataires: cntLocataires[0].value,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

      const results: any[] = [];

      for (const bail of allBaux) {
        if (!bail.indiceReference || !bail.valeurIndiceBase || !bail.loyerBaseHT) {
          continue;
        }

        // Find the latest index value matching this bail's indice type
        const latestIndices = await db
          .select()
          .from(indices)
          .where(eq(indices.type, bail.indiceReference))
          .orderBy(desc(indices.trimestre))
          .limit(1);

        if (latestIndices.length === 0) continue;

        const latestIndex = latestIndices[0];
        const indiceBase = parseFloat(bail.valeurIndiceBase);
        const indiceNouveau = parseFloat(latestIndex.valeur);
        const loyerBaseHT = parseFloat(bail.loyerBaseHT);

        if (indiceBase === 0) continue;

        const nouveauLoyer = loyerBaseHT * (indiceNouveau / indiceBase);
        const tauxVariation = ((indiceNouveau - indiceBase) / indiceBase) * 100;
        const ancienLoyer = bail.loyerHTActu ? parseFloat(bail.loyerHTActu) : loyerBaseHT;

        // Create indexation record
        const [indexation] = await db
          .insert(indexationsGL)
          .values({
            bailId: bail.id,
            dateApplication: new Date().toISOString().slice(0, 10),
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

      res.json({ count: results.length, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
