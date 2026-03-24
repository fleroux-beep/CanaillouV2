import type { Express } from "express";
import { db } from "../db";
import {
  refTauxEmprunt, refValeursVenales, refValeursLocatives,
  refTauxCapitalisation, actifs,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate, refTauxEmpruntSchema, refValeursVenalesSchema, refValeursLocativesSchema, refTauxCapitalisationSchema } from "../lib/validation";
import { logger } from "../lib/logger";
import { syncDVF } from "../lib/sync-dvf";
import { syncANIL } from "../lib/sync-anil";
import { computeTauxCapiFromRefs } from "../lib/compute-taux-capi";
import { scrapeAllActifs, scrapeForActif, getEtudeMarche } from "../lib/scrapers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registerMarketCrud(
  app: Express,
  path: string,
  table: any,
  schema: any,
) {
  app.get(`/api/am/marche/${path}`, requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(table).orderBy(desc(table.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("market route error", { path, error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.post(`/api/am/marche/${path}`, requireWriteAdmin, validate(schema), async (req: any, res: any) => {
    try {
      const rows = await db.insert(table).values(req.body).returning() as any[];
      res.status(201).json(rows[0]);
    } catch (error: any) {
      logger.error("market route error", { path, error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.patch(`/api/am/marche/${path}/:id`, requireWriteAdmin, validate(schema.partial()), async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!UUID_RE.test(id)) return res.status(400).json({ error: "ID invalide" });
      const rows = await db.update(table).set(req.body).where(eq(table.id, id)).returning() as any[];
      if (rows.length === 0) return res.status(404).json({ error: "Non trouvé" });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error("market route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.delete(`/api/am/marche/${path}/:id`, requireWriteAdmin, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!UUID_RE.test(id)) return res.status(400).json({ error: "ID invalide" });
      await db.delete(table).where(eq(table.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("market route error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}

export function registerMarcheRoutes(app: Express) {
  // CRUD for 4 reference tables
  registerMarketCrud(app, "taux-emprunt", refTauxEmprunt, refTauxEmpruntSchema);
  registerMarketCrud(app, "valeurs-venales", refValeursVenales, refValeursVenalesSchema);
  registerMarketCrud(app, "valeurs-locatives", refValeursLocatives, refValeursLocativesSchema);
  registerMarketCrud(app, "taux-capitalisation", refTauxCapitalisation, refTauxCapitalisationSchema);

  // ============================================================
  // Sync DVF — Fetch prix/m² par code postal des actifs
  // ============================================================
  app.post("/api/am/marche/sync-dvf", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      // Get distinct (code_postal, ville) pairs from actifs
      const actifsRows = await db.select({ codePostal: actifs.codePostal, ville: actifs.ville })
        .from(actifs)
        .where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));

      // Deduplicate by code_postal (keep one ville per CP)
      const pairMap = new Map<string, string>();
      for (const a of actifsRows) {
        if (a.codePostal && a.ville) pairMap.set(a.codePostal, a.ville);
      }
      if (pairMap.size === 0) {
        return res.json({ message: "Aucun actif avec un code postal renseigné. Ajoutez un code postal à vos actifs avant de synchroniser.", synced: 0, errors: [] });
      }

      const actifPairs = [...pairMap.entries()].map(([codePostal, ville]) => ({ codePostal, ville }));
      logger.info("sync-dvf: starting", { pairs: actifPairs });
      const result = await syncDVF(actifPairs);
      res.json(result);
    } catch (error: any) {
      logger.error("sync-dvf error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur sync DVF: ${error.message}` });
    }
  });

  // ============================================================
  // Sync ANIL — Fetch loyers/m² carte des loyers
  // ============================================================
  app.post("/api/am/marche/sync-anil", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const actifsRows = await db.select({ codePostal: actifs.codePostal, ville: actifs.ville })
        .from(actifs)
        .where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));

      // Deduplicate by code_postal (keep one ville per CP)
      const pairMap = new Map<string, string>();
      for (const a of actifsRows) {
        if (a.codePostal && a.ville) pairMap.set(a.codePostal, a.ville);
      }
      if (pairMap.size === 0) {
        return res.json({ message: "Aucun actif avec un code postal renseigné. Ajoutez un code postal à vos actifs avant de synchroniser.", synced: 0, errors: [] });
      }

      const actifPairs = [...pairMap.entries()].map(([codePostal, ville]) => ({ codePostal, ville }));
      logger.info("sync-anil: starting", { pairs: actifPairs });
      const result = await syncANIL(actifPairs);
      res.json(result);
    } catch (error: any) {
      logger.error("sync-anil error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur sync ANIL: ${error.message}` });
    }
  });

  // ============================================================
  // Compute taux de capitalisation (dérivé DVF × ANIL)
  // ============================================================
  app.post("/api/am/marche/compute-taux-capi", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const result = await computeTauxCapiFromRefs();
      res.json(result);
    } catch (error: any) {
      logger.error("compute-taux-capi error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur calcul taux capi: ${error.message}` });
    }
  });

  // ============================================================
  // Étude de marché — Phase 2 (Scraping) — asynchrone
  // ============================================================

  // État global du scraping en cours
  let scrapingJob: {
    status: "running" | "done" | "error";
    startedAt: string;
    total: number;
    scraped: number;
    progress: number; // nombre d'actifs traités
    progressTotal: number; // nombre d'actifs à traiter
    errors: string[];
    finishedAt?: string;
  } | null = null;

  // Lancer le scraping (fire-and-forget) — répond immédiatement
  app.post("/api/am/marche/sync-scraping", requireWriteAdmin, async (_req: any, res: any) => {
    if (scrapingJob?.status === "running") {
      return res.json({ message: "Scraping déjà en cours", job: scrapingJob });
    }

    scrapingJob = {
      status: "running",
      startedAt: new Date().toISOString(),
      total: 0,
      scraped: 0,
      progress: 0,
      progressTotal: 0,
      errors: [],
    };

    res.json({ message: "Scraping lancé", job: scrapingJob });

    // Exécuter en arrière-plan
    (async () => {
      try {
        logger.info("sync-scraping: starting global scrape (async)");
        const result = await scrapeAllActifs((progress, total) => {
          if (scrapingJob) {
            scrapingJob.progress = progress;
            scrapingJob.progressTotal = total;
          }
        });
        if (scrapingJob) {
          scrapingJob.status = "done";
          scrapingJob.total = result.total;
          scrapingJob.scraped = result.scraped;
          scrapingJob.errors = result.errors;
          scrapingJob.finishedAt = new Date().toISOString();
        }
      } catch (error: any) {
        logger.error("sync-scraping error", { error: error.message, stack: error.stack });
        if (scrapingJob) {
          scrapingJob.status = "error";
          scrapingJob.errors = [error.message];
          scrapingJob.finishedAt = new Date().toISOString();
        }
      }
    })();
  });

  // Endpoint de statut pour le polling
  app.get("/api/am/marche/sync-scraping/status", requireAuth, async (_req: any, res: any) => {
    res.json({ job: scrapingJob });
  });

  // Sync par actif
  app.post("/api/am/marche/sync-scraping/:actifId", requireWriteAdmin, async (req: any, res: any) => {
    try {
      const actifId = req.params.actifId;
      if (!UUID_RE.test(actifId)) return res.status(400).json({ error: "ID invalide" });

      const [actif] = await db.select().from(actifs).where(eq(actifs.id, actifId));
      if (!actif) return res.status(404).json({ error: "Actif non trouvé" });

      const result = await scrapeForActif(actif);
      res.json(result);
    } catch (error: any) {
      logger.error("sync-scraping error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: `Erreur scraping: ${error.message}` });
    }
  });

  // ============================================================
  // Étude de marché — Vue consolidée par actif (Phase 1 + Phase 2)
  // ============================================================

  app.get("/api/am/marche/etude", requireAuth, async (_req: any, res: any) => {
    try {
      const data = await getEtudeMarche();
      res.json(data);
    } catch (error: any) {
      logger.error("etude-marche error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/marche/etude/:actifId", requireAuth, async (req: any, res: any) => {
    try {
      const actifId = req.params.actifId;
      if (!UUID_RE.test(actifId)) return res.status(400).json({ error: "ID invalide" });

      const data = await getEtudeMarche(actifId);
      if (data.length === 0) return res.status(404).json({ error: "Actif non trouvé" });
      res.json(data[0]);
    } catch (error: any) {
      logger.error("etude-marche error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
