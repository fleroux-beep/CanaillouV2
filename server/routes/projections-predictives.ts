/**
 * Axe 6 — Projections prédictives côté AM
 *
 * Projette le portefeuille sur N années avec :
 * - Valorisation évolutive (taux de croissance marché)
 * - NOI projeté (indexation loyers, inflation charges)
 * - Service de dette décroissant (amortissement)
 * - LTV et DSCR projetés
 * - Cash-flow net cumulé
 * - DCF et TRI estimé
 */
import type { Express } from "express";
import { db } from "../db";
import { actifs, lots, bauxAM, emprunts, scis } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

interface ProjectionParams {
  horizon: number; // years
  tauxIndexation: number; // loyer growth % per year
  tauxInflationCharges: number; // charges inflation %
  tauxCroissanceMarche: number; // market value growth %
  tauxActualisation: number; // discount rate for DCF
}

interface YearProjection {
  annee: number;
  loyerAnnuel: number;
  charges: number;
  noi: number;
  serviceDette: number;
  cashFlowNet: number;
  cashFlowCumule: number;
  crd: number;
  valorisation: number;
  ltv: number;
  dscr: number;
  nav: number;
}

interface ActifProjection {
  actifId: string;
  actifNom: string;
  sciNom: string;
  projections: YearProjection[];
  dcf: {
    van: number;
    tri: number;
    valeurTerminale: number;
    cashFlowsCumules: number;
  };
}

export function registerProjectionsPredictivesRoutes(app: Express) {
  app.post("/api/am/projections-predictives", requireAuth, async (req: any, res: any) => {
    try {
      const params: ProjectionParams = {
        horizon: Math.min(Math.max(Number(req.body.horizon) || 10, 1), 30),
        tauxIndexation: Number(req.body.tauxIndexation) || 2.0,
        tauxInflationCharges: Number(req.body.tauxInflationCharges) || 1.5,
        tauxCroissanceMarche: Number(req.body.tauxCroissanceMarche) || 1.5,
        tauxActualisation: Number(req.body.tauxActualisation) || 6.0,
      };

      const allActifs = await db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
      const allLots = await db.select().from(lots).where(and(eq(lots.archived, false), isNull(lots.deletedAt)));
      const allBaux = await db.select().from(bauxAM).where(and(eq(bauxAM.archived, false), isNull(bauxAM.deletedAt)));
      const allEmprunts = await db.select().from(emprunts).where(and(eq(emprunts.archived, false), isNull(emprunts.deletedAt)));
      const allScis = await db.select().from(scis).where(isNull(scis.deletedAt));

      const results: ActifProjection[] = [];

      for (const actif of allActifs) {
        const sci = allScis.find((s: any) => s.id === actif.sciId);
        const actifLots = allLots.filter((l: any) => l.actifId === actif.id);
        const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && b.statut !== "résilié");
        const actifEmprunts = allEmprunts.filter((e: any) => e.actifId === actif.id);
        const sciEmprunts = allEmprunts.filter((e: any) => e.sciId === actif.sciId && !e.actifId);
        const nbActifsInSci = allActifs.filter((a: any) => a.sciId === actif.sciId).length || 1;

        // Base values (Year 0)
        const loyerBase = actifBaux.reduce((s, b: any) => {
          return s + Number(b.loyerAnnuel || 0) + Number(b.loyerMensuel || 0) * 12;
        }, 0) || actifLots.reduce((s, l: any) => {
          return s + Number(l.loyerAnnuel || 0) + Number(l.loyerMensuel || 0) * 12;
        }, 0);

        const chargesBase = Number(actif.chargesCopropriete || actif.chargesAnnuelles || 0)
          + Number(actif.taxeFonciere || 0) + Number(actif.assurancePno || 0);

        const prixAcq = Number(actif.prixAcquisition || 0) + Number(actif.fraisNotaire || 0)
          + Number(actif.fraisAgence || 0) + Number(actif.montantTravaux || 0);

        let valeurBase = prixAcq;
        const tauxCapi = Number(actif.tauxCapitalisation || 0);
        const noiBase = loyerBase - chargesBase;
        if (tauxCapi > 0 && noiBase > 0) valeurBase = noiBase / (tauxCapi / 100);

        const crdBase = actifEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0)
          + sciEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0) / nbActifsInSci;

        const serviceDetteAnnuel = actifEmprunts.reduce((s, e: any) => s + Number(e.mensualite || 0) * 12, 0)
          + sciEmprunts.reduce((s, e: any) => s + Number(e.mensualite || 0) * 12, 0) / nbActifsInSci;

        // Average interest rate for amortization
        const allActifEmprunts = [...actifEmprunts, ...sciEmprunts];
        const totalEmprunte = allActifEmprunts.reduce((s, e: any) => s + Number(e.montantEmprunte || 0), 0);
        const weightedRate = totalEmprunte > 0
          ? allActifEmprunts.reduce((s, e: any) => s + Number(e.tauxAnnuel || 0) * Number(e.montantEmprunte || 0), 0) / totalEmprunte
          : 0;

        // Project
        const projections: YearProjection[] = [];
        let cashFlowCumule = 0;
        const cashFlows: number[] = [-prixAcq]; // Year 0 = investment

        for (let y = 1; y <= params.horizon; y++) {
          const loyer = loyerBase * Math.pow(1 + params.tauxIndexation / 100, y);
          const charges = chargesBase * Math.pow(1 + params.tauxInflationCharges / 100, y);
          const noi = loyer - charges;
          const valorisation = valeurBase * Math.pow(1 + params.tauxCroissanceMarche / 100, y);

          // Simple amortization: CRD decreases linearly (simplified)
          const remainingYears = allActifEmprunts.reduce((maxY, e: any) => {
            const df = e.dateFin ? new Date(e.dateFin) : null;
            if (df) {
              const yrsLeft = Math.max(0, (df.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000) - y);
              return Math.max(maxY, yrsLeft);
            }
            return Math.max(maxY, (Number(e.dureeAns || 0)) - y);
          }, 0);

          // CRD projection (simplified: assume constant service de dette until maturity)
          let crd = crdBase;
          if (serviceDetteAnnuel > 0 && weightedRate > 0) {
            const interetAnnuel = crdBase * (weightedRate / 100);
            const amortPerYear = serviceDetteAnnuel - interetAnnuel;
            crd = Math.max(0, crdBase - amortPerYear * y);
          } else {
            const totalDuree = allActifEmprunts.reduce((maxD, e: any) => Math.max(maxD, Number(e.dureeAns || 0)), 0);
            if (totalDuree > 0) crd = Math.max(0, crdBase * (1 - y / totalDuree));
          }

          const serviceDette = crd > 0 ? serviceDetteAnnuel : 0;
          const cashFlowNet = noi - serviceDette;
          cashFlowCumule += cashFlowNet;

          const ltv = valorisation > 0 ? (crd / valorisation) * 100 : 0;
          const dscr = serviceDette > 0 ? noi / serviceDette : 999;
          const nav = valorisation - crd;

          projections.push({
            annee: y,
            loyerAnnuel: Math.round(loyer),
            charges: Math.round(charges),
            noi: Math.round(noi),
            serviceDette: Math.round(serviceDette),
            cashFlowNet: Math.round(cashFlowNet),
            cashFlowCumule: Math.round(cashFlowCumule),
            crd: Math.round(crd),
            valorisation: Math.round(valorisation),
            ltv: Math.round(ltv * 10) / 10,
            dscr: serviceDette > 0 ? Math.round(dscr * 100) / 100 : 0,
            nav: Math.round(nav),
          });

          cashFlows.push(cashFlowNet);
        }

        // Terminal value (Gordon growth model)
        const lastNOI = projections[projections.length - 1]?.noi || noiBase;
        const exitCap = (tauxCapi || 5.5) / 100;
        const valeurTerminale = lastNOI / exitCap;
        cashFlows[cashFlows.length - 1] += valeurTerminale;

        // DCF: VAN (NPV)
        const discountRate = params.tauxActualisation / 100;
        const van = cashFlows.reduce((npv, cf, i) => npv + cf / Math.pow(1 + discountRate, i), 0);

        // TRI (IRR) - Newton-Raphson approximation
        let tri = 0.1; // initial guess
        for (let iter = 0; iter < 100; iter++) {
          let f = 0, df = 0;
          for (let i = 0; i < cashFlows.length; i++) {
            f += cashFlows[i] / Math.pow(1 + tri, i);
            df -= i * cashFlows[i] / Math.pow(1 + tri, i + 1);
          }
          if (Math.abs(df) < 1e-10) break;
          const newTri = tri - f / df;
          if (Math.abs(newTri - tri) < 1e-8) { tri = newTri; break; }
          tri = newTri;
        }

        results.push({
          actifId: actif.id,
          actifNom: actif.nom,
          sciNom: sci?.nom || "—",
          projections,
          dcf: {
            van: Math.round(van),
            tri: Math.round(tri * 10000) / 100,
            valeurTerminale: Math.round(valeurTerminale),
            cashFlowsCumules: Math.round(cashFlowCumule),
          },
        });
      }

      res.json({
        params,
        projections: results,
        portfolioSummary: {
          vanTotal: results.reduce((s, r) => s + r.dcf.van, 0),
          triMoyen: results.length > 0
            ? Math.round(results.reduce((s, r) => s + r.dcf.tri, 0) / results.length * 100) / 100
            : 0,
          cashFlowsCumulesTotal: results.reduce((s, r) => s + r.dcf.cashFlowsCumules, 0),
        },
      });
    } catch (error: any) {
      logger.error("projections-predictives error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
