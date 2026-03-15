import type { Express } from "express";
import { db } from "../db";
import {
  scis, actifs, lots, bauxAM, emprunts, locatairesAM, associes, travaux,
} from "@shared/schema";
import {
  bailleurs, bauxGL, locatairesGL, paiementsGL, facturesGL, indices,
} from "@shared/schema";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

// Map module + entity name to Drizzle table
const tableMap: Record<string, Record<string, any>> = {
  am: {
    scis,
    actifs,
    lots,
    baux: bauxAM,
    emprunts,
    locataires: locatairesAM,
    associes,
    travaux,
  },
  gl: {
    bailleurs,
    baux: bauxGL,
    locataires: locatairesGL,
    paiements: paiementsGL,
    factures: facturesGL,
    indices,
  },
};

export function registerImportRoutes(app: Express) {
  app.post("/api/import/:module/:entity", requireAuth, async (req: any, res: any) => {
    try {
      const moduleName = req.params.module as string;
      const entity = req.params.entity as string;
      const { data } = req.body;

      // Validate module
      const moduleMap = tableMap[moduleName];
      if (!moduleMap) {
        return res.status(400).json({ error: `Module inconnu : ${moduleName}` });
      }

      // Validate entity
      const table = moduleMap[entity];
      if (!table) {
        return res.status(400).json({ error: `Entité inconnue : ${entity}` });
      }

      // Validate data
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: "Le champ 'data' doit être un tableau non vide" });
      }

      // Insert rows in batches of 100
      const BATCH_SIZE = 100;
      let insertedCount = 0;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const rows = await db.insert(table).values(batch).returning() as any[];
        insertedCount += rows.length;
      }

      res.status(201).json({
        success: true,
        count: insertedCount,
        message: `${insertedCount} enregistrement(s) importé(s) dans ${moduleName}/${entity}`,
      });
    } catch (error: any) {
      logger.error("import error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
