import type { Express } from "express";
import { db } from "../db";
import {
  refTauxEmprunt, refValeursVenales, refValeursLocatives,
  refTauxCapitalisation, actifs, etudesIA, lots, bauxGL, emprunts,
  locatairesGL, scis,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { validate, refTauxEmpruntSchema, refValeursVenalesSchema, refValeursLocativesSchema, refTauxCapitalisationSchema } from "../lib/validation";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";
import { paramId } from "../lib/crud-factory";
import { getBailLoyer } from "@shared/utils/bail";

const syncLimiter = rateLimit(3, 30 * 60 * 1000, "sync-marche"); // 3 per 30 min
const analyseIALimiter = rateLimit(5, 10 * 60 * 1000, "analyse-ia"); // 5 per 10 min
import { syncDVF } from "../lib/sync-dvf";
import { syncANIL } from "../lib/sync-anil";
import { computeTauxCapiFromRefs } from "../lib/compute-taux-capi";
import { mapActifTypeToSearch } from "../lib/scrapers/base";

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
      const id = paramId(req, res);
      if (!id) return;
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
      const id = paramId(req, res);
      if (!id) return;
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

  /** Lookup helpers for pre-fetched ref data */
  function findRef<T extends { codePostal: string | null; typeBien: string | null; source: string | null }>(
    rows: T[], cp: string, typeBien: string, source: string,
  ): T | undefined {
    return rows.find((r) => r.codePostal === cp && r.typeBien === typeBien && r.source === source);
  }

  /** Assemble Phase 1 data for an asset using pre-fetched ref tables */
  function getPhase1(
    actifRow: any,
    allVenales: any[],
    allLocatives: any[],
    allTauxCapi: any[],
  ) {
    const cp = actifRow.codePostal || "";
    const { typeBien, dvfCompatible, anilCompatible } = mapActifTypeToSearch(actifRow.type || "résidentiel");

    const venale = dvfCompatible ? findRef(allVenales, cp, typeBien, "dvf") : undefined;
    const locative = anilCompatible ? findRef(allLocatives, cp, typeBien, "anil") : undefined;
    const taux = (dvfCompatible && anilCompatible)
      ? findRef(allTauxCapi, cp, typeBien, "calculé") : undefined;

    return {
      valeurVenale: venale
        ? { prixM2Median: Number(venale.prixM2Median), prixM2Bas: Number(venale.prixM2Bas), prixM2Haut: Number(venale.prixM2Haut), nbTransactions: venale.nbTransactions, periode: venale.periode, source: "DVF" }
        : null,
      valeurLocative: locative
        ? { loyerM2Median: Number(locative.loyerM2MensuelMedian), loyerM2Bas: Number(locative.loyerM2MensuelBas), loyerM2Haut: Number(locative.loyerM2MensuelHaut), periode: locative.periode, source: "ANIL" }
        : null,
      tauxCapi: taux
        ? { taux: Number(taux.tauxCapi), tauxBas: Number(taux.tauxCapiBas), tauxHaut: Number(taux.tauxCapiHaut), fiabilite: taux.fiabilite, methode: taux.methodeCalcul }
        : null,
    };
  }

  /** Build full context for Claude AI analysis */
  async function buildActifContext(actifRow: any) {
    const [allVenales, allLocatives, allTauxCapi, actifLots, actifBaux, actifEmprunts, allLocataires] = await Promise.all([
      db.select().from(refValeursVenales),
      db.select().from(refValeursLocatives),
      db.select().from(refTauxCapitalisation),
      db.select().from(lots).where(and(eq(lots.actifId, actifRow.id), isNull(lots.deletedAt))),
      db.select().from(bauxGL).where(and(eq(bauxGL.actifId, actifRow.id), eq(bauxGL.scope, "am"), isNull(bauxGL.deletedAt))),
      db.select().from(emprunts).where(and(eq(emprunts.actifId, actifRow.id), isNull(emprunts.deletedAt))),
      db.select().from(locatairesGL),
    ]);

    const phase1 = getPhase1(actifRow, allVenales, allLocatives, allTauxCapi);

    const loyerAnnuel = actifBaux.reduce(
      (s: number, b: any) => s + getBailLoyer(b),
      0,
    );
    const surface = Number(actifRow.surfaceCarrez || actifRow.surface || 0);
    const prixAcq = Number(actifRow.prixAcquisition || 0) + Number(actifRow.fraisNotaire || 0) + Number(actifRow.fraisAgence || 0) + Number(actifRow.montantTravaux || 0);
    const chargesTotal = Number(actifRow.chargesCopropriete || actifRow.chargesAnnuelles || 0) + Number(actifRow.taxeFonciere || 0) + Number(actifRow.assurancePno || 0);
    const lotsOccupes = actifLots.filter((l: any) => l.statut === "loué").length;

    // Bail details with locataire names
    const bauxDetail = actifBaux.filter((b: any) => b.statut !== "résilié").map((b: any) => {
      const loc = b.locataireId ? allLocataires.find((l: any) => l.id === b.locataireId) : null;
      return {
        locataire: loc?.nom || null,
        typeBail: b.typeBail,
        dateDebut: b.dateDebut,
        dateFin: b.dateFin,
        loyerAnnuel: getBailLoyer(b),
        depotGarantie: Number(b.depotGarantie || 0),
        indiceReference: b.indiceReference,
      };
    });

    // Emprunt summary
    const empruntsSummary = actifEmprunts.filter((e: any) => !e.archived).map((e: any) => ({
      banque: e.banque,
      montant: Number(e.montantEmprunte || 0),
      crd: Number(e.capitalRestantDu || e.montantEmprunte || 0),
      taux: Number(e.tauxAnnuel || 0),
      mensualite: Number(e.mensualite || 0),
      dateFin: e.dateFin,
    }));
    const totalCRD = empruntsSummary.reduce((s, e) => s + e.crd, 0);
    const echeanceAnnuelle = empruntsSummary.reduce((s, e) => s + e.mensualite * 12, 0);

    const rendementNet = prixAcq > 0 ? Math.round(((loyerAnnuel - chargesTotal) / prixAcq) * 10000) / 100 : 0;
    const cashFlowAnnuel = loyerAnnuel - chargesTotal - echeanceAnnuelle;

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
        rendementNet,
        cashFlowAnnuel: Math.round(cashFlowAnnuel),
        nbLots: actifLots.length,
        lotsOccupes,
        tauxOccupation: actifLots.length > 0 ? Math.round((lotsOccupes / actifLots.length) * 100) : 100,
        baux: bauxDetail,
        emprunts: empruntsSummary,
        totalCRD: Math.round(totalCRD),
        echeanceAnnuelle: Math.round(echeanceAnnuelle),
      },
    };
  }

  const AI_MODEL = "claude-sonnet-4-5-20250929";

  /** Call Claude API for market analysis */
  async function analyseActifIA(actifContext: any): Promise<any> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

    const isCreche = actifContext.actif.type === "creche" || actifContext.actif.type === "crèche";
    const isCommercial = isCreche || actifContext.actif.type === "commercial";

    const prompt = `Tu es un analyste immobilier senior spécialisé en asset management ${isCreche ? "de crèches et locaux à destination petite enfance" : isCommercial ? "de locaux commerciaux" : ""} en France.

Analyse cet actif immobilier et produis une analyse patrimoniale structurée en JSON.

## Données de l'actif
${JSON.stringify(actifContext.actif, null, 2)}

${actifContext.phase1.valeurVenale ? `## Données de marché DVF (transactions comparables locaux commerciaux)
${JSON.stringify(actifContext.phase1.valeurVenale, null, 2)}
Note : Ces données DVF couvrent tous les locaux commerciaux du secteur, pas uniquement les crèches.` : "## Données de marché DVF\nAucune donnée DVF disponible."}

## Instructions

${isCreche ? `CONTEXTE SPÉCIFIQUE CRÈCHE :
- Les crèches sont des actifs commerciaux à bail long terme (9-12 ans) avec des locataires souvent institutionnels (gestionnaires de crèches type LPC, Babilou, People&Baby, etc.)
- Les loyers sont sécurisés par des conventions PSU (Prestation de Service Unique) avec la CAF et les collectivités
- L'analyse doit se concentrer sur : la solidité du locataire, la durée restante du bail, le rendement, le taux d'effort, la couverture de la dette par les loyers
- Les données ANIL (loyers résidentiels) ne s'appliquent PAS — ne compare pas aux loyers résidentiels
- Le vrai comparable est le rendement interne (loyer / prix acquisition)
` : ""}Produis une analyse structurée au format JSON strict avec ces clés :

{
  "positionnement": {
    "loyerVsMarche": "au-dessus" | "en-dessous" | "dans la moyenne",
    "ecartLoyerPct": <number, écart estimé en % — pour les crèches, compare au rendement moyen du secteur crèches (5-7%) plutôt qu'au marché résidentiel>,
    "prixVsMarche": "au-dessus" | "en-dessous" | "dans la moyenne",
    "ecartPrixPct": <number, écart estimé en % vs comparables commerciaux du secteur>,
    "commentaire": "<2-3 phrases sur le positionnement — pour les crèches, analyse la pertinence du rendement par rapport au marché des crèches>"
  },
  "potentiel": {
    "margeLoyer": <number, potentiel de revalorisation du loyer en % à échéance du bail>,
    "plusValue": <number, estimation de plus-value potentielle en % basée sur le rendement et la localisation>,
    "horizonAns": <number, horizon temporel recommandé — pour les crèches, aligner sur la durée du bail>,
    "commentaire": "<2-3 phrases — pour les crèches, analyse l'indexation (ILC/ILAT), le renouvellement, et la demande locale en places de crèche>"
  },
  "risques": [
    {
      "type": "vacance" | "locataire" | "obsolescence_energetique" | "marche" | "reglementaire" | "structural" | "fiscal" | "refinancement",
      "niveau": "faible" | "modéré" | "élevé",
      "description": "<1-2 phrases — pour les crèches : risque locataire = solidité du gestionnaire, risque vacance = faible si convention PSU, risque refinancement = maturité des emprunts>"
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
  "comparables": "<3-5 phrases : pour les crèches, décris le contexte du marché des crèches dans cette zone (demande, prix, taux de remplissage estimé) plutôt que des transactions résidentielles>",
  "synthese": "<Résumé exécutif en 4-6 phrases : rendement, solidité locative, couverture dette, recommandation principale>",
  "confidence": "A" | "B" | "C" | "D" | "E"
}

Règles :
- Base-toi UNIQUEMENT sur les données fournies. Si une donnée manque, indique-le et ajuste ta confidence.
- La confidence dépend de la complétude des données : A = actif complet + baux détaillés + emprunts, B = données majoritairement complètes, C = données partielles, D-E = insuffisant.
- Sois pragmatique et actionnable, pas théorique.
- Pour les crèches, le risque DPE est moins critique (baux commerciaux non soumis aux mêmes interdictions que le résidentiel).
- Analyse la couverture de la dette : loyer annuel vs échéance annuelle des emprunts (DSCR).
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
      const actifId = paramId(req, res, "actifId");
      if (!actifId) return;

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

  /** Compute internal metrics for an asset: rendement interne, taux capi interne */
  function computeInternalMetrics(actifRow: any, actifLots: any[], actifBaux: any[], phase1: any) {
    const surface = Number(actifRow.surfaceCarrez || actifRow.surface || 0);
    const prixAcq = Number(actifRow.prixAcquisition || 0) + Number(actifRow.fraisNotaire || 0)
      + Number(actifRow.fraisAgence || 0) + Number(actifRow.montantTravaux || 0);
    const loyerAnnuel = actifBaux.reduce(
      (s: number, b: any) => s + getBailLoyer(b),
      0,
    );
    const lotsOccupes = actifLots.filter((l: any) => l.statut === "loué").length;

    const prixM2 = surface > 0 ? Math.round(prixAcq / surface) : 0;
    const loyerM2Mensuel = surface > 0 ? Math.round((loyerAnnuel / 12 / surface) * 100) / 100 : 0;
    const rendementBrut = prixAcq > 0 ? Math.round((loyerAnnuel / prixAcq) * 10000) / 100 : 0;

    const tauxCapiInterne = rendementBrut > 0 ? rendementBrut : null;

    let ecartPrixPct: number | null = null;
    if (prixM2 > 0 && phase1.valeurVenale?.prixM2Median) {
      ecartPrixPct = Math.round(((prixM2 - phase1.valeurVenale.prixM2Median) / phase1.valeurVenale.prixM2Median) * 10000) / 100;
    }

    let ecartLoyerPct: number | null = null;
    if (loyerM2Mensuel > 0 && phase1.valeurLocative?.loyerM2Median) {
      ecartLoyerPct = Math.round(((loyerM2Mensuel - phase1.valeurLocative.loyerM2Median) / phase1.valeurLocative.loyerM2Median) * 10000) / 100;
    }

    // Charges annuelles
    const chargesAnnuelles = Number(actifRow.chargesAnnuelles || actifRow.chargesCopropriete || 0);
    const taxeFonciere = Number(actifRow.taxeFonciere || 0);
    const assurancePno = Number(actifRow.assurancePno || 0);
    const totalCharges = chargesAnnuelles + taxeFonciere + assurancePno;
    const rendementNet = prixAcq > 0 ? Math.round(((loyerAnnuel - totalCharges) / prixAcq) * 10000) / 100 : 0;

    return {
      surface, prixAcq, prixM2, loyerAnnuel, loyerM2Mensuel, rendementBrut, rendementNet,
      tauxCapiInterne, ecartPrixPct, ecartLoyerPct,
      chargesAnnuelles: totalCharges, taxeFonciere, assurancePno,
      nbLots: actifLots.length, lotsOccupes,
      tauxOccupation: actifLots.length > 0 ? Math.round((lotsOccupes / actifLots.length) * 100) : 100,
    };
  }

  /** Build bail summaries for an asset */
  function buildBauxSummary(actifBaux: any[], allLocataires: any[]) {
    return actifBaux
      .filter((b: any) => b.statut !== "résilié")
      .map((b: any) => {
        const loc = b.locataireId ? allLocataires.find((l: any) => l.id === b.locataireId) : null;
        const loyerAnn = getBailLoyer(b);
        return {
          locataire: loc ? loc.nom : null,
          typeBail: b.typeBail,
          dateDebut: b.dateDebut,
          dateFin: b.dateFin,
          loyerAnnuel: loyerAnn,
          depotGarantie: Number(b.depotGarantie || 0),
          indiceReference: b.indiceReference,
          statut: b.statut,
        };
      });
  }

  /** Build emprunt summary for an asset */
  function buildEmpruntSummary(actifEmprunts: any[]) {
    const active = actifEmprunts.filter((e: any) => !e.archived);
    if (active.length === 0) return null;
    const totalCRD = active.reduce((s: number, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0);
    const echeanceAnnuelle = active.reduce((s: number, e: any) => s + Number(e.mensualite || 0) * 12, 0);
    const tauxSum = active.reduce((s: number, e: any) => s + Number(e.tauxAnnuel || 0), 0);
    const tauxMoyen = active.length > 0 ? Math.round((tauxSum / active.length) * 100) / 100 : 0;
    const datesFin = active.map((e: any) => e.dateFin).filter(Boolean).sort();
    return {
      nbEmprunts: active.length,
      totalCRD: Math.round(totalCRD),
      echeanceAnnuelle: Math.round(echeanceAnnuelle),
      tauxMoyen,
      dateFinDerniere: datesFin.length > 0 ? datesFin[datesFin.length - 1] : null,
    };
  }

  // ─── Analyse patrimoniale : données internes + baux + emprunts + IA ──
  app.get("/api/am/marche/etude", requireAuth, async (_req: any, res: any) => {
    try {
      // Fetch all data upfront (avoid N+1 queries)
      const [allActifs, allEtudes, allVenales, allLocatives, allTauxCapi, allLots, allBaux, allEmprunts, allLocataires, allScis] = await Promise.all([
        db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt))),
        db.select().from(etudesIA),
        db.select().from(refValeursVenales),
        db.select().from(refValeursLocatives),
        db.select().from(refTauxCapitalisation),
        db.select().from(lots).where(isNull(lots.deletedAt)),
        db.select().from(bauxGL).where(and(eq(bauxGL.scope, "am"), isNull(bauxGL.deletedAt))),
        db.select().from(emprunts).where(isNull(emprunts.deletedAt)),
        db.select().from(locatairesGL),
        db.select().from(scis),
      ]);

      // Portfolio-level stats
      let portfolioLoyerTotal = 0;
      let portfolioPrixTotal = 0;
      let portfolioRendSum = 0;
      let portfolioRendCount = 0;

      const data = allActifs.map((actifRow) => {
        const phase1 = getPhase1(actifRow, allVenales, allLocatives, allTauxCapi);
        const etude = allEtudes.find((e) => e.actifId === actifRow.id);
        const actifLots = allLots.filter((l) => l.actifId === actifRow.id);
        const actifBaux = allBaux.filter((b) => b.actifId === actifRow.id);
        const actifEmprunts = allEmprunts.filter((e) => e.actifId === actifRow.id);
        const interne = computeInternalMetrics(actifRow, actifLots, actifBaux, phase1);
        const bauxDetail = buildBauxSummary(actifBaux, allLocataires);
        const empruntSummary = buildEmpruntSummary(actifEmprunts);

        // Cash-flow = loyer - charges - échéances emprunts
        const cashFlowAnnuel = interne.loyerAnnuel - interne.chargesAnnuelles - (empruntSummary?.echeanceAnnuelle || 0);

        // SCI name
        const sci = actifRow.sciId ? allScis.find((s: any) => s.id === actifRow.sciId) : null;

        // Aggregate portfolio stats
        portfolioLoyerTotal += interne.loyerAnnuel;
        portfolioPrixTotal += interne.prixAcq;
        if (interne.rendementBrut > 0) {
          portfolioRendSum += interne.rendementBrut;
          portfolioRendCount++;
        }

        // Locataire principal (first active bail)
        const locatairePrincipal = bauxDetail.length > 0 ? bauxDetail[0].locataire : null;
        // Earliest bail expiry
        const datesFin = bauxDetail.map((b) => b.dateFin).filter(Boolean).sort();
        const prochaineEcheanceBail = datesFin.length > 0 ? datesFin[0] : null;

        return {
          actif: {
            id: actifRow.id, nom: actifRow.nom, adresse: actifRow.adresse,
            ville: actifRow.ville, codePostal: actifRow.codePostal,
            type: actifRow.type, surface: actifRow.surface, surfaceCarrez: actifRow.surfaceCarrez,
            dpe: actifRow.dpe, sci: sci ? sci.nom : null,
            dateAcquisition: actifRow.dateAcquisition,
          },
          phase1,
          interne,
          bauxDetail,
          empruntSummary,
          cashFlowAnnuel: Math.round(cashFlowAnnuel),
          locatairePrincipal,
          prochaineEcheanceBail,
          analyseIA: etude ? {
            id: etude.id, positionnement: etude.positionnement, potentiel: etude.potentiel,
            risques: etude.risques, recommandations: etude.recommandations, comparables: etude.comparables,
            synthese: etude.synthese, confidence: etude.confidence, model: etude.model, createdAt: etude.createdAt,
          } : null,
        };
      });

      // Add portfolio stats to response
      const portfolioStats = {
        totalActifs: allActifs.length,
        patrimoineTotal: Math.round(portfolioPrixTotal),
        loyerAnnuelTotal: Math.round(portfolioLoyerTotal),
        rendementBrutMoyen: portfolioRendCount > 0 ? Math.round((portfolioRendSum / portfolioRendCount) * 100) / 100 : 0,
      };

      res.json({ assets: data, portfolioStats });
    } catch (error: any) {
      logger.error("etude-marche error", { error: error.message, stack: error.stack });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/am/marche/etude/:actifId", requireAuth, async (req: any, res: any) => {
    try {
      const actifId = paramId(req, res, "actifId");
      if (!actifId) return;

      const [actifRow] = await db.select().from(actifs).where(eq(actifs.id, actifId));
      if (!actifRow) return res.status(404).json({ error: "Actif non trouvé" });

      const [allVenales, allLocatives, allTauxCapi, actifLots, actifBaux, actifEmprunts, allLocataires] = await Promise.all([
        db.select().from(refValeursVenales),
        db.select().from(refValeursLocatives),
        db.select().from(refTauxCapitalisation),
        db.select().from(lots).where(and(eq(lots.actifId, actifId), isNull(lots.deletedAt))),
        db.select().from(bauxGL).where(and(eq(bauxGL.actifId, actifId), eq(bauxGL.scope, "am"), isNull(bauxGL.deletedAt))),
        db.select().from(emprunts).where(and(eq(emprunts.actifId, actifId), isNull(emprunts.deletedAt))),
        db.select().from(locatairesGL),
      ]);

      const phase1 = getPhase1(actifRow, allVenales, allLocatives, allTauxCapi);
      const interne = computeInternalMetrics(actifRow, actifLots, actifBaux, phase1);
      const bauxDetail = buildBauxSummary(actifBaux, allLocataires);
      const empruntSummary = buildEmpruntSummary(actifEmprunts);
      const cashFlowAnnuel = interne.loyerAnnuel - interne.chargesAnnuelles - (empruntSummary?.echeanceAnnuelle || 0);
      const [etude] = await db.select().from(etudesIA).where(eq(etudesIA.actifId, actifId));

      res.json({
        actif: {
          id: actifRow.id, nom: actifRow.nom, adresse: actifRow.adresse,
          ville: actifRow.ville, codePostal: actifRow.codePostal,
          type: actifRow.type, surface: actifRow.surface, surfaceCarrez: actifRow.surfaceCarrez,
          dpe: actifRow.dpe,
        },
        phase1,
        interne,
        bauxDetail,
        empruntSummary,
        cashFlowAnnuel: Math.round(cashFlowAnnuel),
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
