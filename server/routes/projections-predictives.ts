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
import { actifs, lots, bauxGL, emprunts, scis } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getBailLoyer } from "@shared/utils/bail";
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
      const clamp = (v: number, min: number, max: number, fallback: number) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
      };
      const params: ProjectionParams = {
        horizon: clamp(req.body.horizon, 1, 30, 10),
        tauxIndexation: clamp(req.body.tauxIndexation, -10, 20, 2.0),
        tauxInflationCharges: clamp(req.body.tauxInflationCharges, -10, 20, 1.5),
        tauxCroissanceMarche: clamp(req.body.tauxCroissanceMarche, -20, 30, 1.5),
        tauxActualisation: clamp(req.body.tauxActualisation, 0.1, 30, 6.0),
      };

      const allActifs = await db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
      const allLots = await db.select().from(lots).where(and(eq(lots.archived, false), isNull(lots.deletedAt)));
      const allBaux = await db.select().from(bauxGL).where(and(eq(bauxGL.archived, false), eq(bauxGL.scope, "am"), isNull(bauxGL.deletedAt)));
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

        // Base values (Year 0) — rent lives on the bail only
        // (loyerHTActu fallback loyerBaseHT).
        const loyerBase = actifBaux.reduce(
          (s, b: any) => s + getBailLoyer(b),
          0,
        );

        const chargesBase = Number(actif.chargesCopropriete || actif.chargesAnnuelles || 0)
          + Number(actif.taxeFonciere || 0) + Number(actif.assurancePno || 0);

        const prixAcq = Number(actif.prixAcquisition || 0) + Number(actif.fraisNotaire || 0)
          + Number(actif.fraisAgence || 0) + Number(actif.montantTravaux || 0);

        let valeurBase = prixAcq;
        const tauxCapi = Number(actif.tauxCapitalisation || 0);
        const noiBase = loyerBase - chargesBase;
        if (tauxCapi > 0) {
          // If NOI <= 0, estimated value is 0 — do not mask the problem
          valeurBase = noiBase > 0 ? noiBase / (tauxCapi / 100) : 0;
        }

        const crdBase = actifEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0)
          + sciEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0) / nbActifsInSci;

        // Compute annuity with actuarial fallback when mensualite is not set
        function computeAnnuite(e: any): number {
          const mens = Number(e.mensualite || 0);
          if (mens > 0) return mens * 12;
          const montant = Number(e.montantEmprunte || 0);
          const duree = Number(e.dureeAns || 0);
          if (montant <= 0 || duree <= 0) return 0;
          const tauxAnnuel = Number(e.tauxAnnuel || 0) / 100;
          if (tauxAnnuel <= 0) return montant / duree;
          const rm = tauxAnnuel / 12;
          const n = duree * 12;
          const factor = Math.pow(1 + rm, n);
          return (montant * (rm * factor) / (factor - 1)) * 12;
        }
        const serviceDetteAnnuel = actifEmprunts.reduce((s, e: any) => s + computeAnnuite(e), 0)
          + sciEmprunts.reduce((s, e: any) => s + computeAnnuite(e), 0) / nbActifsInSci;

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

          // CRD projection: compute actual remaining balance after y years
          // using proper amortization (interest computed on declining balance)
          let crd = 0;
          if (serviceDetteAnnuel > 0 && weightedRate > 0) {
            // Simulate year-by-year amortization on the blended loan
            let bal = crdBase;
            const annualRate = weightedRate / 100;
            for (let yr = 0; yr < y && bal > 0; yr++) {
              const interetAn = bal * annualRate;
              const capitalAn = Math.min(bal, serviceDetteAnnuel - interetAn);
              bal = Math.max(0, bal - capitalAn);
            }
            crd = bal;
          } else if (serviceDetteAnnuel > 0) {
            // Zero-rate loan: linear amortization
            crd = Math.max(0, crdBase - serviceDetteAnnuel * y);
          } else {
            const totalDuree = allActifEmprunts.reduce((maxD, e: any) => Math.max(maxD, Number(e.dureeAns || 0)), 0);
            if (totalDuree > 0) crd = Math.max(0, crdBase * (1 - y / totalDuree));
            else crd = crdBase;
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
        const exitCapPct = Number(tauxCapi || 5.5);
        const exitCap = exitCapPct > 0 ? exitCapPct / 100 : 0;
        const valeurTerminale = exitCap >= 0.01 ? lastNOI / exitCap : 0;
        cashFlows[cashFlows.length - 1] += valeurTerminale;

        // DCF: VAN (NPV)
        const discountRate = params.tauxActualisation / 100;
        const van = cashFlows.reduce((npv, cf, i) => npv + cf / Math.pow(1 + discountRate, i), 0);

        // TRI (IRR) - Newton-Raphson approximation with safety bounds
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
          if (tri < -0.99) tri = -0.5;
          if (!Number.isFinite(tri)) { tri = 0; break; }
        }
        if (!Number.isFinite(tri)) tri = 0;

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
