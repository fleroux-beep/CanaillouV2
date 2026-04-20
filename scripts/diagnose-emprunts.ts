/**
 * diagnose-emprunts.ts — Audit des emprunts AM pour identifier les causes
 * d'un cash-flow négatif anormal.
 *
 * Vérifie :
 *   1. Doublons (même banque + montant + SCI/actif)
 *   2. CRD > montant emprunté initial
 *   3. Ratio service dette / CRD anormal (> 8 % en moyenne = suspect)
 *   4. Mensualités aberrantes (> montant / 12 = probable annuelle stockée comme mensuelle)
 *   5. Répartition emprunts SCI vs actif
 *
 * Usage : npx tsx scripts/diagnose-emprunts.ts
 */
import { db } from "../server/db";
import { emprunts, actifs, scis } from "../shared/schema";
import { eq, and, isNull } from "drizzle-orm";

const EUR = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const PCT = (n: number) => `${n.toFixed(2)} %`;

async function main() {
  console.log("=== DIAGNOSTIC EMPRUNTS AM ===\n");

  const allEmprunts = await db
    .select()
    .from(emprunts)
    .where(and(eq(emprunts.archived, false), isNull(emprunts.deletedAt)));
  const allActifs = await db
    .select()
    .from(actifs)
    .where(and(eq(actifs.archived, false), isNull(actifs.deletedAt)));
  const allScis = await db.select().from(scis).where(isNull(scis.deletedAt));

  const sciName = (id: string | null) => allScis.find((s) => s.id === id)?.nom || "?";
  const actifName = (id: string | null) =>
    id ? allActifs.find((a) => a.id === id)?.nom || "?" : null;

  console.log(`Emprunts actifs : ${allEmprunts.length}`);
  console.log(`Actifs : ${allActifs.length}`);
  console.log(`SCI : ${allScis.length}\n`);

  const getAnnuite = (e: any): number => {
    const mens = Number(e.mensualite || 0);
    if (mens > 0) return mens * 12;
    const montant = Number(e.montantEmprunte || 0);
    const duree = Number(e.dureeAns || 0);
    if (montant <= 0 || duree <= 0) return 0;
    const taux = Number(e.tauxAnnuel || 0) / 100;
    if (taux <= 0) return montant / duree;
    const rm = taux / 12;
    const n = duree * 12;
    const factor = Math.pow(1 + rm, n);
    return (montant * (rm * factor)) / (factor - 1) * 12;
  };

  // ---- 1. Totaux agrégés ------------------------------------------------------
  const totalMontant = allEmprunts.reduce((s, e) => s + Number(e.montantEmprunte || 0), 0);
  const totalCRD = allEmprunts.reduce(
    (s, e) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0),
    0,
  );
  const totalService = allEmprunts.reduce((s, e) => s + getAnnuite(e), 0);
  const ratio = totalCRD > 0 ? (totalService / totalCRD) * 100 : 0;

  console.log("--- Totaux ---");
  console.log(`  Montant emprunté initial : ${EUR(totalMontant)}`);
  console.log(`  CRD actuel               : ${EUR(totalCRD)}`);
  console.log(`  Service dette annuel     : ${EUR(totalService)}`);
  console.log(`  Ratio service / CRD      : ${PCT(ratio)} (attendu 4-7 %)\n`);

  // ---- 2. CRD > montant -------------------------------------------------------
  const crdSup = allEmprunts.filter((e) => {
    const crd = Number(e.capitalRestantDu || 0);
    const mnt = Number(e.montantEmprunte || 0);
    return crd > mnt && mnt > 0;
  });
  if (crdSup.length > 0) {
    console.log(`--- ⚠️  ${crdSup.length} emprunts avec CRD > montant initial ---`);
    for (const e of crdSup.slice(0, 10)) {
      console.log(
        `  ${e.banque} [${sciName(e.sciId)}${actifName(e.actifId) ? " / " + actifName(e.actifId) : ""}] ` +
          `: montant ${EUR(Number(e.montantEmprunte || 0))} / CRD ${EUR(Number(e.capitalRestantDu || 0))}`,
      );
    }
    console.log("");
  }

  // ---- 3. Mensualités aberrantes (probable annualisation) --------------------
  const mensSuspectes = allEmprunts.filter((e) => {
    const mens = Number(e.mensualite || 0);
    const mnt = Number(e.montantEmprunte || 0);
    const duree = Number(e.dureeAns || 0);
    if (mens <= 0 || mnt <= 0 || duree <= 0) return false;
    // Mensualité > montant/12 est impossible même à 100 % d'intérêt annuel
    return mens > mnt / 12;
  });
  if (mensSuspectes.length > 0) {
    console.log(`--- 🚨 ${mensSuspectes.length} emprunts avec mensualité impossible (> montant/12) ---`);
    for (const e of mensSuspectes.slice(0, 10)) {
      const mens = Number(e.mensualite);
      const mnt = Number(e.montantEmprunte);
      console.log(
        `  ${e.banque} [${sciName(e.sciId)}] : mens ${EUR(mens)} ` +
          `(${PCT((mens / mnt) * 100)} du montant/mois — probable annuelle stockée comme mensuelle)`,
      );
    }
    console.log("");
  }

  // ---- 4. Doublons potentiels (même sci+banque+montant) ----------------------
  const key = (e: any) =>
    `${e.sciId}|${e.actifId || ""}|${e.banque}|${Math.round(Number(e.montantEmprunte || 0))}`;
  const groups: Record<string, typeof allEmprunts> = {};
  for (const e of allEmprunts) {
    const k = key(e);
    (groups[k] ||= []).push(e);
  }
  const doublons = Object.entries(groups).filter(([, arr]) => arr.length > 1);
  if (doublons.length > 0) {
    console.log(`--- 🚨 ${doublons.length} groupes de doublons potentiels (sci + banque + montant) ---`);
    for (const [k, arr] of doublons.slice(0, 10)) {
      console.log(`  ${k} — ${arr.length} occurrences`);
    }
    console.log("");
  }

  // ---- 5. Emprunts au niveau SCI vs actif ------------------------------------
  const sciLvl = allEmprunts.filter((e) => !e.actifId).length;
  const actifLvl = allEmprunts.filter((e) => !!e.actifId).length;
  console.log(`--- Répartition ---`);
  console.log(`  Niveau SCI (holding) : ${sciLvl}`);
  console.log(`  Niveau actif         : ${actifLvl}\n`);

  // ---- 6. Top 10 emprunts par service dette ----------------------------------
  const sorted = [...allEmprunts]
    .map((e) => ({ e, service: getAnnuite(e) }))
    .sort((a, b) => b.service - a.service)
    .slice(0, 10);
  console.log(`--- Top 10 service dette ---`);
  for (const { e, service } of sorted) {
    const crd = Number(e.capitalRestantDu || 0);
    const r = crd > 0 ? (service / crd) * 100 : 0;
    console.log(
      `  ${EUR(service)}/an [${PCT(r)} du CRD] — ${e.banque} ` +
        `[${sciName(e.sciId)}${actifName(e.actifId) ? " / " + actifName(e.actifId) : " (holding)"}]`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
