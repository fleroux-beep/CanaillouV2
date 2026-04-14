import type { Express } from "express";
import { db } from "../db";
import {
  scis, actifs, lots, emprunts, associes, travaux,
} from "@shared/schema";
import {
  bailleurs, bauxGL, locatairesGL, paiementsGL, facturesGL, indices,
} from "@shared/schema";
import { requireAdmin } from "../middleware/auth";
import { amSchemas, glSchemas } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { logger } from "../lib/logger";
import type { z } from "zod";

const importLimiter = rateLimit(10, 60 * 1000); // 10 imports per minute

// Map module + entity name to Drizzle table. Since unification, am.baux and
// gl.baux both target the unified bauxGL table — the `scope` column (forced
// below for the AM module) is what separates them.
const tableMap: Record<string, Record<string, any>> = {
  am: {
    scis,
    actifs,
    lots,
    baux: bauxGL,
    emprunts,
    locataires: locatairesGL,
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

// Map module + entity name to Zod schema for validation
const schemaMap: Record<string, Record<string, z.AnyZodObject>> = {
  am: amSchemas,
  gl: glSchemas,
};

export function registerImportRoutes(app: Express) {
  app.post("/api/import/:module/:entity", requireAdmin, importLimiter, async (req: any, res: any) => {
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

      // Validate each row against the Zod schema if available
      const zodSchema = schemaMap[moduleName]?.[entity];
      const validatedData: any[] = [];
      const errors: Array<{ row: number; issues: string[] }> = [];

      for (let i = 0; i < data.length; i++) {
        if (zodSchema) {
          const result = zodSchema.safeParse(data[i]);
          if (!result.success) {
            errors.push({
              row: i + 1,
              issues: result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`),
            });
          } else {
            validatedData.push(result.data);
          }
        } else {
          // No schema available — accept raw (table-level constraints still apply)
          validatedData.push(data[i]);
        }
      }

      if (errors.length > 0 && validatedData.length === 0) {
        return res.status(400).json({
          error: `Toutes les ${errors.length} ligne(s) sont invalides`,
          validationErrors: errors.slice(0, 20), // Limit to first 20
        });
      }

      // Force scope on baux imports so AM imports can't leak into GL views
      // (and vice-versa). gl.baux gets scope='gl', am.baux gets scope='am'.
      const forceScope = entity === "baux" ? moduleName : undefined;

      // Insert validated rows in batches of 100
      const BATCH_SIZE = 100;
      let insertedCount = 0;

      for (let i = 0; i < validatedData.length; i += BATCH_SIZE) {
        const batch = validatedData.slice(i, i + BATCH_SIZE);
        const batchWithScope = forceScope
          ? batch.map((row: any) => ({ ...row, scope: forceScope }))
          : batch;
        const rows = await db.insert(table).values(batchWithScope).returning() as any[];
        insertedCount += rows.length;
      }

      res.status(201).json({
        success: true,
        count: insertedCount,
        skippedCount: errors.length,
        message: `${insertedCount} enregistrement(s) importé(s) dans ${moduleName}/${entity}`,
        ...(errors.length > 0 ? { validationErrors: errors.slice(0, 20) } : {}),
      });
    } catch (error: any) {
      logger.error("import error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
