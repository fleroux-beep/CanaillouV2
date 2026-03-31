/**
 * Shared CRUD factory for AM and GL routes.
 * Eliminates duplication between am.ts and gl.ts (M3.1 fix).
 */
import type { Express } from "express";
import { db } from "../db";
import { eq, desc, isNull } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate } from "./validation";
import { logger } from "./logger";
import type { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract and validate a UUID :id param. Returns the id string.
 * If `res` is provided and the id is invalid, sends a 400 response and returns "".
 */
export function paramId(req: any, res?: any): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (res && !UUID_RE.test(id)) {
    res.status(400).json({ error: "ID invalide" });
    return "";
  }
  // Always validate UUID format — return empty string if invalid
  if (!UUID_RE.test(id)) return "";
  return id;
}

interface CrudOptions {
  prefix: string; // "am" or "gl"
  schemas: Record<string, z.AnyZodObject>;
}

export function registerCrud(app: Express, path: string, table: any, opts: CrudOptions) {
  const schema = opts.schemas[path];
  const apiPath = `/api/${opts.prefix}/${path}`;

  app.get(apiPath, requireAuth, async (_req: any, res: any) => {
    try {
      const hasDeletedAt = "deletedAt" in table;
      const rows = hasDeletedAt
        ? await db.select().from(table).where(isNull(table.deletedAt)).orderBy(desc(table.createdAt))
        : await db.select().from(table).orderBy(desc(table.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { path: apiPath, error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get(`${apiPath}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1) as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.post(apiPath, requireWriteAdmin, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.patch(`${apiPath}/:id`, requireWriteAdmin, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;
      const updateData = "updatedAt" in table
        ? { ...req.body, updatedAt: new Date() }
        : req.body;
      const rows = await db.update(table).set(updateData).where(eq(table.id, id)).returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.delete(`${apiPath}/:id`, requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;
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
