import type { Express } from "express";
import { db } from "../db";
import { scis, associes, participations, actifs, lots, locatairesAM, bauxAM, emprunts, travaux, documentsAM } from "@shared/schema";
import { eq, desc, count, isNull, and } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate, amSchemas } from "../lib/validation";
import { logger } from "../lib/logger";
import { geocodeAddress, needsGeocoding } from "../lib/geocode";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramId(req: any, res?: any): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (res && !UUID_RE.test(id)) {
    res.status(400).json({ error: "ID invalide" });
    return "";
  }
  return id;
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
      logger.error("route error", { path, error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur interne: ${error.message}` });
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

  app.post(`/api/am/${path}`, requireWriteAdmin, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.patch(`/api/am/${path}/:id`, requireWriteAdmin, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
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

  app.delete(`/api/am/${path}/:id`, requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = paramId(req);
      const now = new Date();
      const hasDeletedAt = "deletedAt" in table;
      if (hasDeletedAt) {
        await db.update(table).set({ deletedAt: now }).where(eq(table.id, id));
      } else {
        await db.delete(table).where(eq(table.id, id));
      }

      // Cascade soft-delete for SCI: propagate to actifs, emprunts, participations
      if (path === "scis") {
        if ("deletedAt" in actifs) {
          await db.update(actifs).set({ deletedAt: now }).where(eq(actifs.sciId, id));
        }
        if ("deletedAt" in emprunts) {
          await db.update(emprunts).set({ deletedAt: now }).where(eq(emprunts.sciId, id));
        }
        // Cascade further: soft-delete lots and baux linked to the SCI's actifs
        const sciActifs = await db.select({ id: actifs.id }).from(actifs).where(eq(actifs.sciId, id));
        for (const a of sciActifs) {
          if ("deletedAt" in lots) {
            await db.update(lots).set({ deletedAt: now }).where(eq(lots.actifId, a.id));
          }
          if ("deletedAt" in bauxAM) {
            await db.update(bauxAM).set({ deletedAt: now }).where(eq(bauxAM.actifId, a.id));
          }
          await db.delete(travaux).where(eq(travaux.actifId, a.id));
        }
        await db.delete(participations).where(eq(participations.sciId, id));
        logger.info("cascade soft-delete SCI", { sciId: id });
      }

      // Cascade soft-delete for actif: propagate to lots and baux
      if (path === "actifs") {
        if ("deletedAt" in lots) {
          await db.update(lots).set({ deletedAt: now }).where(eq(lots.actifId, id));
        }
        if ("deletedAt" in bauxAM) {
          await db.update(bauxAM).set({ deletedAt: now }).where(eq(bauxAM.actifId, id));
        }
        await db.delete(travaux).where(eq(travaux.actifId, id));
        logger.info("cascade soft-delete actif", { actifId: id });
      }

      res.json({ ok: true });
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}

/**
 * Routes CRUD spécialisées pour les actifs avec géocodage automatique.
 */
function registerActifsCrud(app: Express) {
  const schema = amSchemas["actifs"];
  const path = "actifs";

  // GET all
  app.get(`/api/am/${path}`, requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(actifs).where(isNull(actifs.deletedAt)).orderBy(desc(actifs.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { path, error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur interne: ${error.message}` });
    }
  });

  // GET one
  app.get(`/api/am/${path}/:id`, requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(actifs).where(eq(actifs.id, paramId(req))).limit(1) as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST — création avec géocodage automatique
  app.post(`/api/am/${path}`, requireWriteAdmin, ...(schema ? [validate(schema)] : []), async (req: any, res: any) => {
    try {
      const body = { ...req.body };

      // Géocodage automatique si adresse fournie sans coordonnées
      if (needsGeocoding(body)) {
        const geo = await geocodeAddress(body.adresse, body.codePostal, body.ville);
        if (geo) {
          body.lat = geo.lat;
          body.lng = geo.lng;
          logger.info("actif geocoded", { nom: body.nom, lat: geo.lat, lng: geo.lng, score: geo.score });
        }
      }

      const rows = await db.insert(actifs).values(body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // PATCH — mise à jour avec re-géocodage si l'adresse change
  app.patch(`/api/am/${path}/:id`, requireWriteAdmin, ...(schema ? [validate(schema.partial())] : []), async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;

      const body = { ...req.body, updatedAt: new Date() };

      // Récupérer l'actif existant pour comparer l'adresse
      const [existing] = await db.select().from(actifs).where(eq(actifs.id, id)).limit(1) as any[];
      if (!existing) return res.status(404).json({ error: "Non trouvé" });

      // Re-géocoder si l'adresse change ou si les coordonnées manquent
      if (needsGeocoding(body, existing)) {
        const adresse = body.adresse ?? existing.adresse;
        const cp = body.codePostal ?? existing.codePostal;
        const ville = body.ville ?? existing.ville;
        const geo = await geocodeAddress(adresse, cp, ville);
        if (geo) {
          body.lat = geo.lat;
          body.lng = geo.lng;
          logger.info("actif re-geocoded", { id, lat: geo.lat, lng: geo.lng, score: geo.score });
        }
      }

      const rows = await db.update(actifs).set(body).where(eq(actifs.id, id)).returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // DELETE — soft delete avec cascade (même logique que le CRUD générique)
  app.delete(`/api/am/${path}/:id`, requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = paramId(req);
      const now = new Date();
      await db.update(actifs).set({ deletedAt: now }).where(eq(actifs.id, id));

      // Cascade soft-delete
      if ("deletedAt" in lots) {
        await db.update(lots).set({ deletedAt: now }).where(eq(lots.actifId, id));
      }
      if ("deletedAt" in bauxAM) {
        await db.update(bauxAM).set({ deletedAt: now }).where(eq(bauxAM.actifId, id));
      }
      await db.delete(travaux).where(eq(travaux.actifId, id));
      logger.info("cascade soft-delete actif", { actifId: id });

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
  registerActifsCrud(app);
  registerCrud(app, "lots", lots);
  registerCrud(app, "locataires", locatairesAM);
  registerCrud(app, "baux", bauxAM);
  registerCrud(app, "emprunts", emprunts);
  registerCrud(app, "travaux", travaux);
  registerCrud(app, "documents", documentsAM);

  // === Custom endpoints ===

  // Géocodage en masse des actifs sans coordonnées GPS
  app.post("/api/am/actifs/geocode-all", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const missing = await db.select().from(actifs).where(
        and(isNull(actifs.deletedAt), eq(actifs.archived, false))
      ) as any[];

      const toGeocode = missing.filter((a: any) => (a.lat == null || a.lng == null) && (a.adresse || a.ville));
      let geocoded = 0;
      const errors: string[] = [];

      for (const actif of toGeocode) {
        const geo = await geocodeAddress(actif.adresse, actif.codePostal, actif.ville);
        if (geo) {
          await db.update(actifs).set({ lat: geo.lat, lng: geo.lng, updatedAt: new Date() }).where(eq(actifs.id, actif.id));
          geocoded++;
          logger.info("batch geocode", { nom: actif.nom, lat: geo.lat, lng: geo.lng });
        } else {
          errors.push(actif.nom);
        }
        // Pause 200ms entre chaque requête pour ne pas surcharger l'API
        await new Promise((r) => setTimeout(r, 200));
      }

      res.json({ total: toGeocode.length, geocoded, errors });
    } catch (error: any) {
      logger.error("geocode-all error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/actifs/:id/lots", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(lots).where(
        and(eq(lots.actifId, paramId(req)), isNull(lots.deletedAt))
      );
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/scis/:id/actifs", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(actifs).where(
        and(eq(actifs.sciId, paramId(req)), isNull(actifs.deletedAt))
      );
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/scis/:id/emprunts", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(emprunts).where(
        and(eq(emprunts.sciId, paramId(req)), isNull(emprunts.deletedAt))
      );
      res.json(rows);
    } catch (error: any) {
      logger.error("route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/lots/:id/baux", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db.select().from(bauxAM).where(
        and(eq(bauxAM.lotId, paramId(req)), isNull(bauxAM.deletedAt))
      );
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
          db.select({ value: count() }).from(scis).where(isNull(scis.deletedAt)),
          db.select({ value: count() }).from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt))),
          db.select({ value: count() }).from(lots).where(and(eq(lots.archived, false), isNull(lots.deletedAt))),
          db.select({ value: count() }).from(bauxAM).where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt))),
          db.select({ value: count() }).from(emprunts).where(and(eq(emprunts.archived, false), isNull(emprunts.deletedAt))),
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
