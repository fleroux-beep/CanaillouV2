/**
 * Axe 4 — Score de santé par actif + recommandations
 *
 * Score composite multi-dimensionnel :
 * - Rendement (25%) : rendement brut vs seuil 5%
 * - Endettement (25%) : LTV vs seuil 60%
 * - Couverture dette (20%) : DSCR vs seuil 1.2x
 * - Occupation (15%) : taux d'occupation des lots
 * - État actif (15%) : données manquantes, ancienneté, travaux
 *
 * Chaque dimension = score 0-100, puis moyenne pondérée.
 */
import type { Express } from "express";
import { db } from "../db";
import { actifs, lots, bauxAM, emprunts, travaux, scis, refMarcheScraping } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

interface DimensionScore {
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
  color: "green" | "amber" | "red";
}

interface HealthScore {
  actifId: string;
  actifNom: string;
  sciId: string | null;
  sciNom: string;
  scoreGlobal: number; // 0-100
  niveau: "Excellent" | "Bon" | "Attention" | "Critique";
  couleur: "green" | "blue" | "amber" | "red";
  dimensions: DimensionScore[];
  recommandations: string[];
  metriques: {
    rendementBrut: number;
    ltv: number;
    dscr: number;
    tauxOccupation: number;
    noi: number;
    valeur: number;
    cashFlowNet: number;
  };
}

function scoreColor(score: number): "green" | "amber" | "red" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function scoreNiveau(score: number): { niveau: HealthScore["niveau"]; couleur: HealthScore["couleur"] } {
  if (score >= 80) return { niveau: "Excellent", couleur: "green" };
  if (score >= 60) return { niveau: "Bon", couleur: "blue" };
  if (score >= 40) return { niveau: "Attention", couleur: "amber" };
  return { niveau: "Critique", couleur: "red" };
}

export function registerScoreSanteRoutes(app: Express) {
  app.get("/api/am/score-sante", requireAuth, async (_req: any, res: any) => {
    try {
      const allActifs = await db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
      const allLots = await db.select().from(lots).where(and(eq(lots.archived, false), isNull(lots.deletedAt)));
      const allBaux = await db.select().from(bauxAM).where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt)));
      const allEmprunts = await db.select().from(emprunts).where(and(eq(emprunts.archived, false), isNull(emprunts.deletedAt)));
      const allTravaux = await db.select().from(travaux);
      const allScis = await db.select().from(scis).where(isNull(scis.deletedAt));

      const scores: HealthScore[] = [];

      for (const actif of allActifs) {
        const sci = allScis.find((s: any) => s.id === actif.sciId);
        const actifLots = allLots.filter((l: any) => l.actifId === actif.id);
        const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && b.statut !== "résilié");
        const actifEmprunts = allEmprunts.filter((e: any) => e.actifId === actif.id);
        const sciEmprunts = allEmprunts.filter((e: any) => e.sciId === actif.sciId && !e.actifId);
        const nbActifsInSci = allActifs.filter((a: any) => a.sciId === actif.sciId).length || 1;
        const actifTravaux = allTravaux.filter((t: any) => t.actifId === actif.id);

        // Calculate financials — aligned with client-side getLoyerAnnuelActif
        const loyerFromBaux = actifBaux.reduce((s, b: any) => {
          const annuel = Number(b.loyerAnnuel || 0);
          return s + (annuel > 0 ? annuel : Number(b.loyerMensuel || 0) * 12);
        }, 0);
        // Fallback: only lots with statut "loué" (NFD-normalized), matching client logic
        const lotsLouesForLoyer = actifLots.filter((l: any) =>
          l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue"
        );
        const loyerAnnuel = loyerFromBaux > 0 ? loyerFromBaux : lotsLouesForLoyer.reduce((s, l: any) => {
          const annuel = Number(l.loyerAnnuel || 0);
          return s + (annuel > 0 ? annuel : Number(l.loyerMensuel || 0) * 12);
        }, 0);

        const chargesTotal = Number(actif.chargesCopropriete ?? actif.chargesAnnuelles ?? 0)
          + Number(actif.taxeFonciere ?? 0) + Number(actif.assurancePno ?? 0);
        const noi = loyerAnnuel - chargesTotal;
        const prixAcq = Number(actif.prixAcquisition || 0) + Number(actif.fraisNotaire || 0)
          + Number(actif.fraisAgence || 0) + Number(actif.montantTravaux || 0);

        // Valorisation — aligned with client-side getValeurEstimee
        // Method 1: capitalisation (loyerNet / taux capi)
        const tauxCapi = Number(actif.tauxCapitalisation || 0);
        const loyerNet = loyerAnnuel - chargesTotal;
        const valeurCapi = tauxCapi > 0 && loyerNet > 0 ? loyerNet / (tauxCapi / 100) : 0;
        // Method 2: comparables (surface × prix/m² marché)
        const surface = Number(actif.surfaceCarrez || actif.surface || 0);
        const prixM2Marche = Number(actif.prixM2Marche || 0);
        const valeurComp = surface > 0 && prixM2Marche > 0 ? surface * prixM2Marche : 0;
        // Median of available methods, fallback to prixAcq
        let valeur = prixAcq;
        if (valeurCapi > 0 && valeurComp > 0) valeur = (valeurCapi + valeurComp) / 2;
        else if (valeurCapi > 0) valeur = valeurCapi;
        else if (valeurComp > 0) valeur = valeurComp;

        // Helper: calcul actuariel de la mensualité (même logique que la page Emprunts)
        function computeMensualite(e: any): number {
          let mens = Number(e.mensualite || 0);
          if (mens > 0) return mens;
          const montant = Number(e.montantEmprunte || 0);
          const duree = Number(e.dureeMois || 0) || (Number(e.dureeAns || 0) * 12);
          if (montant > 0 && duree > 0) {
            const tauxAnnuel = Number(e.tauxAnnuel || 0) / 100;
            if (tauxAnnuel > 0) {
              const rm = tauxAnnuel / 12;
              const factor = Math.pow(1 + rm, duree);
              mens = montant * (rm * factor) / (factor - 1);
            } else {
              mens = montant / duree;
            }
          }
          return mens;
        }

        const crd = actifEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0)
          + sciEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0) / nbActifsInSci;

        const serviceDette = actifEmprunts.reduce((s, e: any) => s + computeMensualite(e) * 12, 0)
          + sciEmprunts.reduce((s, e: any) => s + computeMensualite(e) * 12, 0) / nbActifsInSci;

        const ltv = valeur > 0 ? (crd / valeur) * 100 : 0;
        // Internal DSCR for scoring: use 999 when no debt so score dimensions treat it as excellent.
        // The returned metric uses 0 (no-debt → "N/A" in UI), consistent with client-side getDSCR.
        const dscrInternal = serviceDette > 0 ? noi / serviceDette : 999;
        const dscr = dscrInternal;
        const rendementBrut = prixAcq > 0 ? (loyerAnnuel / prixAcq) * 100 : 0;
        const cashFlowNet = noi - serviceDette;

        // Occupation — normalize accents to match all variants (Loué, loué, LOUÉ, loue…)
        const lotsTotal = actifLots.length || 1;
        const lotsOccupes = actifLots.filter((l: any) =>
          l.statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue"
        ).length;
        const tauxOccupation = (lotsOccupes / lotsTotal) * 100;

        // ─── Dimension scores ───
        const dimensions: DimensionScore[] = [];
        const recommandations: string[] = [];

        // 1. Rendement (25%)
        let scoreRendement = 0;
        if (rendementBrut >= 7) scoreRendement = 100;
        else if (rendementBrut >= 5) scoreRendement = 60 + (rendementBrut - 5) * 20;
        else if (rendementBrut >= 3) scoreRendement = 20 + (rendementBrut - 3) * 20;
        else if (rendementBrut > 0) scoreRendement = rendementBrut * 6.67;
        dimensions.push({
          label: "Rendement",
          score: Math.round(scoreRendement),
          weight: 0.25,
          detail: `Rendement brut: ${rendementBrut.toFixed(1)}%`,
          color: scoreColor(scoreRendement),
        });
        if (rendementBrut < 5) recommandations.push(`Rendement brut faible (${rendementBrut.toFixed(1)}%) — envisager une hausse de loyer ou réduction des charges.`);

        // 2. Endettement / LTV (25%)
        let scoreLTV = 100;
        if (crd === 0) scoreLTV = 100; // No debt = perfect
        else if (ltv <= 40) scoreLTV = 100;
        else if (ltv <= 60) scoreLTV = 100 - (ltv - 40) * 2;
        else if (ltv <= 80) scoreLTV = 60 - (ltv - 60) * 2;
        else scoreLTV = Math.max(0, 20 - (ltv - 80));
        dimensions.push({
          label: "Endettement",
          score: Math.round(scoreLTV),
          weight: 0.25,
          detail: `LTV: ${ltv.toFixed(1)}%`,
          color: scoreColor(scoreLTV),
        });
        if (ltv > 60) recommandations.push(`LTV élevée (${ltv.toFixed(1)}%) — envisager un remboursement anticipé partiel.`);

        // 3. Couverture de dette / DSCR (20%)
        // Use dscrInternal (999 when no debt) for scoring; display uses dscrInternal for detail text
        let scoreDSCR = 100;
        if (serviceDette === 0) scoreDSCR = 100;
        else if (dscrInternal >= 2.0) scoreDSCR = 100;
        else if (dscrInternal >= 1.5) scoreDSCR = 80 + (dscrInternal - 1.5) * 40;
        else if (dscrInternal >= 1.2) scoreDSCR = 50 + (dscrInternal - 1.2) * 100;
        else if (dscrInternal >= 1.0) scoreDSCR = 20 + (dscrInternal - 1.0) * 150;
        else scoreDSCR = Math.max(0, dscrInternal * 20);
        dimensions.push({
          label: "Couverture dette",
          score: Math.round(scoreDSCR),
          weight: 0.20,
          detail: `DSCR: ${serviceDette === 0 ? "N/A (pas de dette)" : dscrInternal.toFixed(2) + "x"}`,
          color: scoreColor(scoreDSCR),
        });
        if (dscrInternal < 1.2 && serviceDette > 0) recommandations.push(`DSCR faible (${dscrInternal.toFixed(2)}x) — risque de tension sur le cash-flow.`);

        // 4. Occupation (15%)
        let scoreOccupation = tauxOccupation;
        if (actifLots.length === 0) scoreOccupation = actifBaux.length > 0 ? 100 : 50;
        dimensions.push({
          label: "Occupation",
          score: Math.round(scoreOccupation),
          weight: 0.15,
          detail: `Taux: ${tauxOccupation.toFixed(0)}% (${lotsOccupes}/${lotsTotal} lots)`,
          color: scoreColor(scoreOccupation),
        });
        if (tauxOccupation < 80 && actifLots.length > 1) recommandations.push(`Vacance de ${(100 - tauxOccupation).toFixed(0)}% — accélérer la commercialisation.`);

        // 5. Complétude (15%) — focus on financially impactful fields
        let scoreEtat = 100;
        const missing: string[] = [];
        // High impact: directly affect financial calculations
        if (!actif.taxeFonciere) { scoreEtat -= 20; missing.push("taxe foncière"); }
        if (!actif.assurancePno) { scoreEtat -= 15; missing.push("assurance PNO"); }
        if (!actif.surface && !actif.surfaceCarrez) { scoreEtat -= 20; missing.push("surface"); }
        if (!actif.tauxCapitalisation && !actif.prixM2Marche) { scoreEtat -= 15; missing.push("taux capi ou prix/m²"); }
        // Low impact: informational only
        if (!actif.dpe) { scoreEtat -= 5; missing.push("DPE"); }
        if (!actif.anneeConstruction) { scoreEtat -= 3; missing.push("année construction"); }
        // Travaux en cours = information, not a penalty
        scoreEtat = Math.max(0, scoreEtat);
        dimensions.push({
          label: "Complétude",
          score: Math.round(scoreEtat),
          weight: 0.15,
          detail: missing.length > 0 ? `Manquant: ${missing.join(", ")}` : "Données complètes",
          color: scoreColor(scoreEtat),
        });
        if (missing.length > 0) recommandations.push(`Données manquantes: ${missing.join(", ")} — compléter la fiche actif.`);

        // Global score
        const scoreGlobal = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));
        const { niveau, couleur } = scoreNiveau(scoreGlobal);

        // Additional smart recommandations
        if (scoreGlobal >= 80 && cashFlowNet > 0) {
          recommandations.push("Actif sain — envisager d'utiliser le cash-flow excédentaire pour rembourser de la dette ou acquérir un nouvel actif.");
        }
        if (ltv < 30 && rendementBrut > 6) {
          recommandations.push("Faible endettement et bon rendement — opportunité d'effet de levier supplémentaire.");
        }

        scores.push({
          actifId: actif.id,
          actifNom: actif.nom,
          sciId: actif.sciId,
          sciNom: sci?.nom || "—",
          scoreGlobal,
          niveau,
          couleur,
          dimensions,
          recommandations,
          metriques: {
            rendementBrut: Math.round(rendementBrut * 100) / 100,
            ltv: Math.round(ltv * 100) / 100,
            dscr: serviceDette > 0 ? Math.round(dscrInternal * 100) / 100 : 0,
            tauxOccupation: Math.round(tauxOccupation),
            noi: Math.round(noi),
            valeur: Math.round(valeur),
            cashFlowNet: Math.round(cashFlowNet),
          },
        });
      }

      // Sort by score ascending (worst first)
      scores.sort((a, b) => a.scoreGlobal - b.scoreGlobal);

      res.json(scores);
    } catch (error: any) {
      logger.error("score-sante error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
