import type { Express } from "express";
import { db } from "../db";
import {
  refTauxEmprunt, refValeursVenales, refValeursLocatives,
  refTauxCapitalisation, actifs, etudesIA, lots, bauxAM, emprunts,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate, refTauxEmpruntSchema, refValeursVenalesSchema, refValeursLocativesSchema, refTauxCapitalisationSchema } from "../lib/validation";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";

const syncLimiter = rateLimit(3, 30 * 60 * 1000, "sync-marche"); // 3 per 30 min
const analyseIALimiter = rateLimit(5, 10 * 60 * 1000, "analyse-ia"); // 5 per 10 min
import { syncDVF } from "../lib/sync-dvf";
import { syncANIL } from "../lib/sync-anil";
import { computeTauxCapiFromRefs } from "../lib/compute-taux-capi";
import { mapActifTypeToSearch } from "../lib/scrapers/base";

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
  app.post("/api/am/marche/sync-dvf", requireWriteAdmin, syncLimiter, async (_req: any, res: any) => {
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
      res.status(500).json({ error: "Erreur sync DVF" });
    }
  });

  // ============================================================
  // Sync ANIL — Fetch loyers/m² carte des loyers
  // ============================================================
  app.post("/api/am/marche/sync-anil", requireWriteAdmin, syncLimiter, async (_req: any, res: any) => {
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
      res.status(500).json({ error: "Erreur sync ANIL" });
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
      res.status(500).json({ error: "Erreur calcul taux capi" });
    }
  });

  // ============================================================
  // Étude de marché — Vue consolidée par actif (Phase 1 + IA)
  // ============================================================

  /** Assemble Phase 1 data for an asset */
  async function getPhase1(actifRow: any) {
    const cp = actifRow.codePostal || "";
    const { typeBien, dvfCompatible, anilCompatible } = mapActifTypeToSearch(actifRow.type || "résidentiel");

    const venales = await db.select().from(refValeursVenales);
    const locatives = await db.select().from(refValeursLocatives);
    const tauxCapi = await db.select().from(refTauxCapitalisation);

    const venalesDVF = dvfCompatible
      ? venales.filter((v) => v.codePostal === cp && v.typeBien === typeBien && v.source === "dvf")
      : [];
    const locativesANIL = anilCompatible
      ? locatives.filter((l) => l.codePostal === cp && l.typeBien === typeBien && l.source === "anil")
      : [];
    const tauxCalc = (dvfCompatible && anilCompatible)
      ? tauxCapi.filter((t) => t.codePostal === cp && t.typeBien === typeBien && t.source === "calculé")
      : [];

    return {
      valeurVenale: venalesDVF[0]
        ? { prixM2Median: Number(venalesDVF[0].prixM2Median), prixM2Bas: Number(venalesDVF[0].prixM2Bas), prixM2Haut: Number(venalesDVF[0].prixM2Haut), nbTransactions: venalesDVF[0].nbTransactions, periode: venalesDVF[0].periode, source: "DVF" }
        : null,
      valeurLocative: locativesANIL[0]
        ? { loyerM2Median: Number(locativesANIL[0].loyerM2MensuelMedian), loyerM2Bas: Number(locativesANIL[0].loyerM2MensuelBas), loyerM2Haut: Number(locativesANIL[0].loyerM2MensuelHaut), periode: locativesANIL[0].periode, source: "ANIL" }
        : null,
      tauxCapi: tauxCalc[0]
        ? { taux: Number(tauxCalc[0].tauxCapi), tauxBas: Number(tauxCalc[0].tauxCapiBas), tauxHaut: Number(tauxCalc[0].tauxCapiHaut), fiabilite: tauxCalc[0].fiabilite, methode: tauxCalc[0].methodeCalcul }
        : null,
    };
  }

  /** Build full context for Claude AI analysis */
  async function buildActifContext(actifRow: any) {
    const phase1 = await getPhase1(actifRow);
    const actifLots = await db.select().from(lots).where(and(eq(lots.actifId, actifRow.id), isNull(lots.deletedAt)));
    const actifBaux = await db.select().from(bauxAM).where(and(eq(bauxAM.actifId, actifRow.id), isNull(bauxAM.deletedAt)));
    const actifEmprunts = await db.select().from(emprunts).where(and(eq(emprunts.actifId, actifRow.id), isNull(emprunts.deletedAt)));

    const loyerAnnuel = actifBaux.reduce((s: number, b: any) => s + Number(b.loyerAnnuel || 0) + Number(b.loyerMensuel || 0) * 12, 0)
      || actifLots.reduce((s: number, l: any) => s + Number(l.loyerAnnuel || 0) + Number(l.loyerMensuel || 0) * 12, 0);
    const surface = Number(actifRow.surfaceCarrez || actifRow.surface || 0);
    const prixAcq = Number(actifRow.prixAcquisition || 0) + Number(actifRow.fraisNotaire || 0) + Number(actifRow.fraisAgence || 0) + Number(actifRow.montantTravaux || 0);
    const chargesTotal = Number(actifRow.chargesCopropriete || actifRow.chargesAnnuelles || 0) + Number(actifRow.taxeFonciere || 0) + Number(actifRow.assurancePno || 0);
    const lotsOccupes = actifLots.filter((l: any) => l.statut === "loué").length;

    return {
      phase1,
      actif: {
        nom: actifRow.nom,
        type: actifRow.type,
        ville: actifRow.ville,
        codePostal: actifRow.codePostal,
        surface,
        dpe: actifRow.dpe,
        anneeConstruction: actifRow.anneeConstruction,
        dateAcquisition: actifRow.dateAcquisition,
        prixAcquisition: prixAcq,
        chargesAnnuelles: chargesTotal,
        taxeFonciere: Number(actifRow.taxeFonciere || 0),
        loyerAnnuel,
        loyerM2Mensuel: surface > 0 ? Math.round((loyerAnnuel / 12 / surface) * 100) / 100 : 0,
        prixM2: surface > 0 ? Math.round(prixAcq / surface) : 0,
        rendementBrut: prixAcq > 0 ? Math.round((loyerAnnuel / prixAcq) * 10000) / 100 : 0,
        nbLots: actifLots.length,
        lotsOccupes,
        tauxOccupation: actifLots.length > 0 ? Math.round((lotsOccupes / actifLots.length) * 100) : 100,
        emprunts: actifEmprunts.map((e: any) => ({
          banque: e.banque,
          montant: Number(e.montantEmprunte || 0),
          crd: Number(e.capitalRestantDu || e.montantEmprunte || 0),
          taux: Number(e.tauxAnnuel || 0),
        })),
      },
    };
  }

  const AI_MODEL = "claude-sonnet-4-5-20250929";

  /** Call Claude API for market analysis */
  async function analyseActifIA(actifContext: any): Promise<any> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

    const prompt = `Tu es un analyste immobilier senior spécialisé en asset management en France.

Analyse cet actif immobilier et produis une étude de marché structurée en JSON.

## Données de l'actif
${JSON.stringify(actifContext.actif, null, 2)}

## Données de marché officielles (Phase 1 — DVF/ANIL)
${JSON.stringify(actifContext.phase1, null, 2)}

## Instructions

Produis une analyse structurée au format JSON strict avec ces clés :

{
  "positionnement": {
    "loyerVsMarche": "au-dessus" | "en-dessous" | "dans la moyenne",
    "ecartLoyerPct": <number, écart en % par rapport au marché>,
    "prixVsMarche": "au-dessus" | "en-dessous" | "dans la moyenne",
    "ecartPrixPct": <number>,
    "commentaire": "<2-3 phrases sur le positionnement>"
  },
  "potentiel": {
    "margeLoyer": <number, potentiel de hausse de loyer en %>,
    "plusValue": <number, estimation de plus-value potentielle en %>,
    "horizonAns": <number, horizon temporel recommandé>,
    "commentaire": "<2-3 phrases>"
  },
  "risques": [
    {
      "type": "vacance" | "obsolescence_energetique" | "marche" | "reglementaire" | "structural" | "fiscal",
      "niveau": "faible" | "modéré" | "élevé",
      "description": "<1-2 phrases>"
    }
  ],
  "recommandations": [
    {
      "action": "<titre court>",
      "priorite": "haute" | "moyenne" | "basse",
      "impact": "<estimation chiffrée si possible>",
      "detail": "<2-3 phrases>"
    }
  ],
  "comparables": "<3-5 phrases décrivant les transactions DVF comparables et le contexte du marché local>",
  "synthese": "<Résumé exécutif en 4-6 phrases : positionnement, forces, faiblesses, recommandation principale>",
  "confidence": "A" | "B" | "C" | "D" | "E"
}

Règles :
- Base-toi UNIQUEMENT sur les données fournies. Si une donnée manque, indique-le et ajuste ta confidence.
- La confidence dépend de la complétude des données : A = données DVF + ANIL + actif complet, E = quasi aucune donnée.
- Sois pragmatique et actionnable, pas théorique.
- Les risques réglementaires DPE sont réels en France (interdiction de location G en 2025, F en 2028, E en 2034).
- Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || "";

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude n'a pas retourné de JSON valide");

    return JSON.parse(jsonMatch[0]);
  }

  // ─── Analyse IA : un seul actif ─────────────────────────────
  app.post("/api/am/marche/analyse-ia/:actifId", requireWriteAdmin, analyseIALimiter, async (req: any, res: any) => {
    try {
      const actifId = req.params.actifId;
      if (!UUID_RE.test(actifId)) return res.status(400).json({ error: "ID invalide" });

      const [actifRow] = await db.select().from(actifs).where(eq(actifs.id, actifId));
      if (!actifRow) return res.status(404).json({ error: "Actif non trouvé" });

      const context = await buildActifContext(actifRow);
      const analysis = await analyseActifIA(context);

      // Upsert: delete old then insert new
      await db.delete(etudesIA).where(eq(etudesIA.actifId, actifId));
      const [row] = await db.insert(etudesIA).values({
        actifId,
        phase1Data: context.phase1,
        positionnement: analysis.positionnement,
        potentiel: analysis.potentiel,
        risques: analysis.risques,
        recommandations: analysis.recommandations,
        comparables: analysis.comparables,
        synthese: analysis.synthese,
        confidence: analysis.confidence,
        model: AI_MODEL,
      }).returning();

      res.json(row);
    } catch (error: any) {
      logger.error("analyse-ia error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur analyse IA" });
    }
  });

  // ──��� Analyse IA : tous les actifs (séquentiel) ──────────────
  app.post("/api/am/marche/analyse-ia", requireWriteAdmin, analyseIALimiter, async (_req: any, res: any) => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée" });

      const allActifs = await db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
      const results: { actifId: string; nom: string; status: "ok" | "error"; error?: string }[] = [];

      for (const actifRow of allActifs) {
        try {
          const context = await buildActifContext(actifRow);
          const analysis = await analyseActifIA(context);

          await db.delete(etudesIA).where(eq(etudesIA.actifId, actifRow.id));
          await db.insert(etudesIA).values({
            actifId: actifRow.id,
            phase1Data: context.phase1,
            positionnement: analysis.positionnement,
            potentiel: analysis.potentiel,
            risques: analysis.risques,
            recommandations: analysis.recommandations,
            comparables: analysis.comparables,
            synthese: analysis.synthese,
            confidence: analysis.confidence,
            model: AI_MODEL,
          });

          results.push({ actifId: actifRow.id, nom: actifRow.nom, status: "ok" });
        } catch (err: any) {
          logger.error("analyse-ia per-actif error", { actifId: actifRow.id, error: err.message });
          results.push({ actifId: actifRow.id, nom: actifRow.nom, status: "error", error: err.message });
        }
      }

      res.json({ total: allActifs.length, analysed: results.filter((r) => r.status === "ok").length, results });
    } catch (error: any) {
      logger.error("analyse-ia-all error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur analyse IA" });
    }
  });

  // ─── Étude de marché : données Phase 1 + dernière analyse IA ──
  app.get("/api/am/marche/etude", requireAuth, async (_req: any, res: any) => {
    try {
      const allActifs = await db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
      const allEtudes = await db.select().from(etudesIA);

      const data = [];
      for (const actifRow of allActifs) {
        const phase1 = await getPhase1(actifRow);
        const etude = allEtudes.find((e) => e.actifId === actifRow.id);
        const { typeBien, dvfCompatible, anilCompatible } = mapActifTypeToSearch(actifRow.type || "résidentiel");

        const avertissements: string[] = [];
        if (!dvfCompatible) avertissements.push(`Pas de données DVF pour le type "${actifRow.type}".`);
        if (!anilCompatible) avertissements.push(`Pas de données ANIL pour le type "${actifRow.type}".`);

        data.push({
          actif: {
            id: actifRow.id,
            nom: actifRow.nom,
            adresse: actifRow.adresse,
            ville: actifRow.ville,
            codePostal: actifRow.codePostal,
            type: actifRow.type,
            surface: actifRow.surface,
            surfaceCarrez: actifRow.surfaceCarrez,
          },
          avertissements,
          phase1,
          analyseIA: etude ? {
            id: etude.id,
            positionnement: etude.positionnement,
            potentiel: etude.potentiel,
            risques: etude.risques,
            recommandations: etude.recommandations,
            comparables: etude.comparables,
            synthese: etude.synthese,
            confidence: etude.confidence,
            model: etude.model,
            createdAt: etude.createdAt,
          } : null,
        });
      }

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

      const [actifRow] = await db.select().from(actifs).where(eq(actifs.id, actifId));
      if (!actifRow) return res.status(404).json({ error: "Actif non trouvé" });

      const phase1 = await getPhase1(actifRow);
      const [etude] = await db.select().from(etudesIA).where(eq(etudesIA.actifId, actifId));

      res.json({
        actif: {
          id: actifRow.id, nom: actifRow.nom, adresse: actifRow.adresse,
          ville: actifRow.ville, codePostal: actifRow.codePostal,
          type: actifRow.type, surface: actifRow.surface, surfaceCarrez: actifRow.surfaceCarrez,
        },
        phase1,
        analyseIA: etude ? {
          id: etude.id, positionnement: etude.positionnement, potentiel: etude.potentiel,
          risques: etude.risques, recommandations: etude.recommandations, comparables: etude.comparables,
          synthese: etude.synthese, confidence: etude.confidence, model: etude.model, createdAt: etude.createdAt,
        } : null,
      });
    } catch (error: any) {
      logger.error("etude-marche error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
