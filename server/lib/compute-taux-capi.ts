/**
 * Service de calcul automatique des taux de capitalisation.
 * Dérive le taux capi en croisant valeurs vénales (DVF) et valeurs locatives (ANIL).
 *
 * Formule: taux_capi = (loyer_m2_annuel / prix_m2) × 100
 */
import { db } from "../db";
import { refValeursVenales, refValeursLocatives, refTauxCapitalisation } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export async function computeTauxCapiFromRefs(): Promise<{ computed: number; errors: string[] }> {
  let computed = 0;
  const errors: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  try {
    // Get all valeurs venales
    const venales = await db.select().from(refValeursVenales);
    // Get all valeurs locatives
    const locatives = await db.select().from(refValeursLocatives);

    // Map locatives by codePostal+typeBien for fast lookup
    // Type mapping: "appartement" venale → "appartement" locative, etc.
    const locativeMap = new Map<string, typeof locatives[0]>();
    for (const l of locatives) {
      const key = `${l.codePostal}|${l.typeBien}`;
      // Keep most recent entry
      const existing = locativeMap.get(key);
      if (!existing || (l.createdAt && existing.createdAt && l.createdAt > existing.createdAt)) {
        locativeMap.set(key, l);
      }
    }

    // For each valeur venale, try to find matching locative and compute taux capi
    for (const v of venales) {
      const key = `${v.codePostal}|${v.typeBien}`;
      const loc = locativeMap.get(key);

      const prixM2 = Number(v.prixM2Median || 0);
      if (prixM2 <= 0) continue;

      let loyerM2Annuel = 0;
      let methode = "";

      if (loc) {
        const loyerMensuel = Number(loc.loyerM2MensuelMedian || 0);
        if (loyerMensuel > 0) {
          loyerM2Annuel = loyerMensuel * 12;
          methode = `${v.source} ${v.periode || ""} / ${loc.source} ${loc.periode || ""}`.trim();
        }
      }

      if (loyerM2Annuel <= 0) continue;

      const tauxCapi = (loyerM2Annuel / prixM2) * 100;

      // Compute fourchette (prudent / optimiste)
      let tauxCapiBas: number | null = null;
      let tauxCapiHaut: number | null = null;

      const prixHaut = Number(v.prixM2Haut || 0);
      const prixBas = Number(v.prixM2Bas || 0);
      const loyerBas = Number(loc?.loyerM2MensuelBas || 0) * 12;
      const loyerHaut = Number(loc?.loyerM2MensuelHaut || 0) * 12;

      if (prixHaut > 0 && loyerBas > 0) {
        tauxCapiBas = (loyerBas / prixHaut) * 100; // scenario prudent
      }
      if (prixBas > 0 && loyerHaut > 0) {
        tauxCapiHaut = (loyerHaut / prixBas) * 100; // scenario optimiste
      }

      // Score de fiabilité
      const nbTx = v.nbTransactions || 0;
      let fiabilite: "haute" | "moyenne" | "faible" = "faible";
      if (nbTx >= 30 && loc) {
        fiabilite = "haute";
      } else if (nbTx >= 10 || loc) {
        fiabilite = "moyenne";
      }

      // Atomic delete + insert: avoids data loss if process crashes between operations.
      await db.transaction(async (tx) => {
        await tx.delete(refTauxCapitalisation).where(
          and(
            eq(refTauxCapitalisation.source, "calculé"),
            eq(refTauxCapitalisation.codePostal, v.codePostal),
            eq(refTauxCapitalisation.typeBien, v.typeBien),
          ),
        );
        await tx.insert(refTauxCapitalisation).values({
          source: "calculé",
          codePostal: v.codePostal,
          ville: v.ville || loc?.ville || null,
          codeInsee: v.codeInsee || loc?.codeInsee || null,
          typeBien: v.typeBien,
          tauxCapi: String(Math.round(tauxCapi * 100) / 100),
          tauxCapiBas: tauxCapiBas != null ? String(Math.round(tauxCapiBas * 100) / 100) : null,
          tauxCapiHaut: tauxCapiHaut != null ? String(Math.round(tauxCapiHaut * 100) / 100) : null,
          fiabilite,
          methodeCalcul: methode,
          periode: v.periode || loc?.periode || null,
          dateReleve: now,
        });
      });
      computed++;
    }
  } catch (err: any) {
    errors.push(err.message);
    logger.error("compute-taux-capi error", { error: err.message });
  }

  logger.info("compute-taux-capi completed", { computed, errors: errors.length });
  return { computed, errors };
}
