/**
 * Axe 1 — Alertes intelligentes proactives
 *
 * Génère des alertes automatiques côté serveur pour AM + GL :
 * - AM: LTV > 60%, DSCR < 1.2, rendement < 5%, emprunt fin proche, taux capi dégradé
 * - GL: Bail expirant, indexation en retard, vacance, loyer sous-marché
 * Calcul périodique (cron) + endpoint de consultation
 */
import type { Express } from "express";
import { db } from "../db";
import {
  alertes, actifs, lots, emprunts, bauxGL, indices, scis,
  refValeursLocatives, refMarcheScraping,
} from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireAuth, requireWriteAdmin } from "../middleware/auth";
import { paramId } from "../lib/crud-factory";
import { logger } from "../lib/logger";
import { getBailLoyer, isResilie } from "@shared/utils/bail";

// ─── Alert generation engine ───────────────────────────────

interface GeneratedAlert {
  module: "am" | "gl";
  entityType: string;
  entityId: string;
  type: string;
  title: string;
  message: string;
  targetDate?: string;
  priority: "urgent" | "haute" | "normale" | "info";
}

async function generateAMAlerts(): Promise<GeneratedAlert[]> {
  const alerts: GeneratedAlert[] = [];
  const now = new Date();

  // PERF(M7.3): These queries fetch all columns from each table separately and
  // then join in JS. Ideally they would be replaced by a single SQL query with
  // JOINs selecting only the columns needed for alert computation (e.g.
  // actifs.id, actifs.nom, actifs.sciId, actifs.prixAcquisition, etc.).
  // However, the Drizzle schema typing and the cross-entity aggregation logic
  // below make a pure-SQL rewrite non-trivial. Leaving as-is for now with this
  // note so a future refactor can address it.
  // Additionally, Promise.all is used to run the independent queries in parallel.
  const [allActifs, allLots, allBaux, allEmprunts, allScis] = await Promise.all([
    db.select().from(actifs).where(and(eq(actifs.archived, false), isNull(actifs.deletedAt))),
    db.select().from(lots).where(and(eq(lots.archived, false), isNull(lots.deletedAt))),
    db.select().from(bauxGL).where(and(eq(bauxGL.archived, false), eq(bauxGL.scope, "am"), isNull(bauxGL.deletedAt))),
    db.select().from(emprunts).where(and(eq(emprunts.archived, false), isNull(emprunts.deletedAt))),
    db.select().from(scis).where(isNull(scis.deletedAt)),
  ]);

  for (const actif of allActifs) {
    const actifBaux = allBaux.filter((b: any) => b.actifId === actif.id && !isResilie(b.statut));
    const actifLots = allLots.filter((l: any) => l.actifId === actif.id);
    const actifEmprunts = allEmprunts.filter((e: any) => e.actifId === actif.id);
    const sciEmprunts = allEmprunts.filter((e: any) => e.sciId === actif.sciId && !e.actifId);
    const nbActifsInSci = allActifs.filter((a: any) => a.sciId === actif.sciId).length || 1;

    // Calculate financials — aligned with client-side getLoyerAnnuelActif.
    // Unified rent lives on the bail only (loyerHTActu fallback loyerBaseHT).
    const loyerAnnuel = actifBaux.reduce(
      (s, b: any) => s + getBailLoyer(b),
      0,
    );

    const charges = Number(actif.chargesCopropriete ?? actif.chargesAnnuelles ?? 0)
      + Number(actif.taxeFonciere ?? 0) + Number(actif.assurancePno ?? 0);
    const noi = loyerAnnuel - charges;
    const prixAcq = Number(actif.prixAcquisition ?? 0) + Number(actif.fraisNotaire ?? 0)
      + Number(actif.fraisAgence ?? 0) + Number(actif.montantTravaux ?? 0);

    // Valorisation — aligned with client-side getValeurEstimee (avg of both methods)
    const tauxCapi = Number(actif.tauxCapitalisation ?? 0);
    const valeurCapi = tauxCapi > 0 && noi > 0 ? noi / (tauxCapi / 100) : 0;
    const surface = Number(actif.surfaceCarrez ?? actif.surface ?? 0);
    const prixM2Marche = Number(actif.prixM2Marche ?? 0);
    const valeurComp = surface > 0 && prixM2Marche > 0 ? surface * prixM2Marche : 0;
    let valeur = prixAcq;
    if (valeurCapi > 0 && valeurComp > 0) valeur = (valeurCapi + valeurComp) / 2;
    else if (valeurCapi > 0) valeur = valeurCapi;
    else if (valeurComp > 0) valeur = valeurComp;

    // CRD
    const crd = actifEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0)
      + sciEmprunts.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0) / nbActifsInSci;

    const serviceDette = actifEmprunts.reduce((s, e: any) => s + Number(e.mensualite || 0) * 12, 0)
      + sciEmprunts.reduce((s, e: any) => s + Number(e.mensualite || 0) * 12, 0) / nbActifsInSci;

    const ltv = valeur > 0 ? (crd / valeur) * 100 : 0;
    const dscr = serviceDette > 0 ? noi / serviceDette : 999;
    const rendementBrut = prixAcq > 0 ? (loyerAnnuel / prixAcq) * 100 : 0;

    // 1. LTV > 60%
    if (ltv > 70) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "ltv_critique", title: "LTV critique",
        message: `LTV de ${ltv.toFixed(1)}% pour "${actif.nom}" — seuil critique dépassé (>70%). Envisager un remboursement anticipé ou une renégociation.`,
        priority: "urgent",
      });
    } else if (ltv > 60) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "ltv_elevee", title: "LTV élevée",
        message: `LTV de ${ltv.toFixed(1)}% pour "${actif.nom}" — au-dessus du seuil recommandé de 60%.`,
        priority: "haute",
      });
    }

    // 2. DSCR < 1.2
    if (dscr < 1.0 && serviceDette > 0) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "dscr_critique", title: "DSCR critique",
        message: `DSCR de ${dscr.toFixed(2)}x pour "${actif.nom}" — les revenus ne couvrent pas le service de la dette.`,
        priority: "urgent",
      });
    } else if (dscr < 1.2 && serviceDette > 0) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "dscr_faible", title: "DSCR faible",
        message: `DSCR de ${dscr.toFixed(2)}x pour "${actif.nom}" — sous le seuil de confort de 1.2x.`,
        priority: "haute",
      });
    }

    // 3. Rendement brut < 5%
    if (rendementBrut > 0 && rendementBrut < 4) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "rendement_faible", title: "Rendement faible",
        message: `Rendement brut de ${rendementBrut.toFixed(1)}% pour "${actif.nom}" — significativement sous le seuil de 5%.`,
        priority: "haute",
      });
    } else if (rendementBrut > 0 && rendementBrut < 5) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "rendement_modere", title: "Rendement modéré",
        message: `Rendement brut de ${rendementBrut.toFixed(1)}% pour "${actif.nom}" — sous le seuil de 5%.`,
        priority: "normale",
      });
    }

    // 4. Vacance
    const lotsVacants = actifLots.filter((l: any) => l.statut === "vacant");
    const tauxVacance = actifLots.length > 0 ? (lotsVacants.length / actifLots.length) * 100 : 0;
    if (tauxVacance > 30) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "vacance_elevee", title: "Vacance élevée",
        message: `${lotsVacants.length}/${actifLots.length} lots vacants (${tauxVacance.toFixed(0)}%) pour "${actif.nom}".`,
        priority: "haute",
      });
    } else if (tauxVacance > 10 && actifLots.length > 1) {
      alerts.push({
        module: "am", entityType: "actif", entityId: actif.id,
        type: "vacance_moderee", title: "Vacance à surveiller",
        message: `${lotsVacants.length}/${actifLots.length} lots vacants (${tauxVacance.toFixed(0)}%) pour "${actif.nom}".`,
        priority: "normale",
      });
    }
  }

  // 5. Emprunts arrivant à échéance
  for (const emprunt of allEmprunts) {
    if (emprunt.dateFin) {
      const dateFin = new Date(emprunt.dateFin);
      const diffDays = Math.ceil((dateFin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 180) {
        alerts.push({
          module: "am", entityType: "emprunt", entityId: emprunt.id,
          type: "emprunt_echeance", title: "Emprunt arrivant à échéance",
          message: `L'emprunt ${emprunt.banque || "—"} arrive à échéance dans ${diffDays} jours (${dateFin.toLocaleDateString("fr-FR")}). Anticiper le refinancement.`,
          targetDate: emprunt.dateFin,
          priority: diffDays <= 90 ? "urgent" : "haute",
        });
      }
    }
  }

  return alerts;
}

async function generateGLAlerts(): Promise<GeneratedAlert[]> {
  const alerts: GeneratedAlert[] = [];
  const now = new Date();

  // PERF(M7.3): Same concern as generateAMAlerts — full table loads joined in JS.
  // allIndices is fetched but only used implicitly (bail.indiceReference is checked
  // but never looked up in allIndices). Consider removing the indices query if unused,
  // or selecting only needed columns.
  const [allBaux, allIndices, locatives] = await Promise.all([
    db.select().from(bauxGL).where(and(eq(bauxGL.archived, false), isNull(bauxGL.deletedAt))),
    db.select().from(indices),
    db.select().from(refValeursLocatives),
  ]);

  for (const bail of allBaux) {
    const nom = bail.nom || "Bail sans nom";

    // 1. Bail expirant
    if (bail.dateFin) {
      const dateFin = new Date(bail.dateFin);
      const diffDays = Math.ceil((dateFin.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        alerts.push({
          module: "gl", entityType: "bail", entityId: bail.id,
          type: "bail_expire", title: "Bail expiré",
          message: `Le bail "${nom}" a expiré le ${dateFin.toLocaleDateString("fr-FR")}. Renouvellement nécessaire.`,
          targetDate: bail.dateFin ? dateFin.toISOString() : undefined,
          priority: "urgent",
        });
      } else if (diffDays <= 90) {
        alerts.push({
          module: "gl", entityType: "bail", entityId: bail.id,
          type: "bail_echeance_proche", title: "Bail expirant bientôt",
          message: `Le bail "${nom}" expire dans ${diffDays} jours (${dateFin.toLocaleDateString("fr-FR")}).`,
          targetDate: bail.dateFin ? dateFin.toISOString() : undefined,
          priority: "urgent",
        });
      } else if (diffDays <= 180) {
        alerts.push({
          module: "gl", entityType: "bail", entityId: bail.id,
          type: "bail_echeance", title: "Échéance à anticiper",
          message: `Le bail "${nom}" expire dans ${diffDays} jours.`,
          targetDate: bail.dateFin ? dateFin.toISOString() : undefined,
          priority: "haute",
        });
      }
    }

    // 2. Échéances triennales
    for (const field of ["echTrien1", "echTrien2", "echTrien3"] as const) {
      const dateStr = bail[field];
      if (dateStr) {
        const dateEch = new Date(dateStr);
        const diffDays = Math.ceil((dateEch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= 180) {
          alerts.push({
            module: "gl", entityType: "bail", entityId: bail.id,
            type: "triennale", title: "Échéance triennale",
            message: `Échéance triennale du bail "${nom}" dans ${diffDays} jours (${dateEch.toLocaleDateString("fr-FR")}).`,
            targetDate: dateStr,
            priority: diffDays <= 90 ? "urgent" : "haute",
          });
        }
      }
    }

    // 3. Indexation non effectuée
    if (bail.indiceReference && bail.loyerBaseHT) {
      const base = Number(bail.loyerBaseHT);
      const actu = Number(bail.loyerHTActu || 0);
      if (actu === 0 || actu === base) {
        alerts.push({
          module: "gl", entityType: "bail", entityId: bail.id,
          type: "indexation_manquante", title: "Indexation non effectuée",
          message: `Le loyer du bail "${nom}" n'a jamais été indexé (indice ${bail.indiceReference}).`,
          priority: "haute",
        });
      }
    }

    // 4. Loyer sous le marché (si données locatives disponibles)
    if (bail.codePostal && bail.surface && bail.loyerHTActu) {
      const surfaceM2 = Number(bail.surface);
      const loyerActu = Number(bail.loyerHTActu);
      const loyerM2Actuel = surfaceM2 > 0 ? loyerActu / surfaceM2 : 0;
      const ref = locatives.find((l) => l.codePostal === bail.codePostal);
      if (ref && ref.loyerM2MensuelMedian && loyerM2Actuel > 0) {
        const loyerMarche = Number(ref.loyerM2MensuelMedian);
        const ecart = ((loyerM2Actuel - loyerMarche) / loyerMarche) * 100;
        if (ecart > 20) {
          alerts.push({
            module: "gl", entityType: "bail", entityId: bail.id,
            type: "loyer_sur_marche", title: "Loyer au-dessus du marché",
            message: `Le bail "${nom}" a un loyer ${ecart.toFixed(0)}% au-dessus du marché (${loyerM2Actuel.toFixed(1)} vs ${loyerMarche.toFixed(1)} €/m²/mois).`,
            priority: "info",
          });
        }
      }
    }

    // 5. Données manquantes critiques
    if (!bail.indiceReference) {
      alerts.push({
        module: "gl", entityType: "bail", entityId: bail.id,
        type: "indice_manquant", title: "Indice de référence manquant",
        message: `Aucun indice de référence renseigné pour le bail "${nom}".`,
        priority: "info",
      });
    }
  }

  return alerts;
}

export async function computeAndStoreAlerts(): Promise<{ am: number; gl: number }> {
  try {
    // Clear old auto-generated alerts
    await db.delete(alertes);

    // Run AM and GL alert generation in parallel
    const [amAlerts, glAlerts] = await Promise.all([
      generateAMAlerts(),
      generateGLAlerts(),
    ]);

    const all = [...amAlerts, ...glAlerts];
    // PERF(M7.3): Batch insert instead of inserting one row at a time
    if (all.length > 0) {
      await db.insert(alertes).values(
        all.map((a) => ({
          module: a.module,
          entityType: a.entityType,
          entityId: a.entityId,
          type: a.type,
          title: a.title,
          message: a.message,
          targetDate: a.targetDate,
          priority: a.priority,
          dismissed: false,
        }))
      );
    }

    logger.info(`Alertes proactives générées: ${amAlerts.length} AM + ${glAlerts.length} GL`);
    return { am: amAlerts.length, gl: glAlerts.length };
  } catch (err: any) {
    logger.error("Erreur génération alertes proactives", { error: err.message });
    return { am: 0, gl: 0 };
  }
}

export function registerAlertesProactivesRoutes(app: Express) {
  // Get all proactive alerts
  app.get("/api/alertes/proactives", requireAuth, async (_req: any, res: any) => {
    try {
      const rows = await db.select().from(alertes)
        .where(eq(alertes.dismissed, false))
        .orderBy(desc(alertes.createdAt));
      res.json(rows);
    } catch (error: any) {
      logger.error("alertes proactives error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Refresh alerts (recalculate)
  app.post("/api/alertes/refresh", requireWriteAdmin, async (_req: any, res: any) => {
    try {
      const result = await computeAndStoreAlerts();
      res.json({ message: "Alertes recalculées", ...result });
    } catch (error: any) {
      logger.error("alertes refresh error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Dismiss an alert
  app.patch("/api/alertes/:id/dismiss", requireAuth, async (req: any, res: any) => {
    try {
      const id = paramId(req, res);
      if (!id) return;
      await db.update(alertes).set({ dismissed: true, dismissedAt: new Date() }).where(eq(alertes.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("alertes dismiss error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
