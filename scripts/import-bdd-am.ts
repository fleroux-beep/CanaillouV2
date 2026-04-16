/**
 * scripts/import-bdd-am.ts
 *
 * Import durable du fichier Excel "BDD SCI … BDD - loyers actuels complétés.xlsx"
 * vers la base de données, en respectant le modèle loyer à trois niveaux :
 *
 *   1. loyerBaseHT           ← colonne "Loyer annuel de départ" (valeur de signature, immuable)
 *   2. loyerHTActu           ← recalculé par l'indexation INSEE automatique
 *                              (on NE force PAS la valeur xlsx "Loyer actuel HC 2026" ici,
 *                              qui est un BUDGET pollué par des prorata / franchises)
 *   3. loyerManuelOverride   ← laissé vide (forceManual = false par défaut)
 *
 * Métadonnées indexation importées séparément : indiceReference, trimestreRef,
 * valeurIndiceBase (parsées depuis la colonne "indice revalorisation loyers"
 * de la feuille BDD — format libre : "ILC 2T2017 = 110", "IRL 3T2023 = 141,03"…).
 *
 * ⚠️  Mode par défaut = DRY-RUN : aucune écriture en base. Le script affiche un
 *    rapport détaillé (matches, mismatches, colonnes modifiées). Pour appliquer
 *    les changements, relancer avec --apply.
 *
 * Usage :
 *   npx tsx scripts/import-bdd-am.ts                       # dry-run
 *   npx tsx scripts/import-bdd-am.ts --apply               # applique
 *   npx tsx scripts/import-bdd-am.ts --file /path/bdd.xlsx # fichier custom
 */

import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import { eq, and } from "drizzle-orm";
import { db } from "../server/db";
import { scis, bauxGL, locatairesGL } from "../shared/schema";

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileArgIdx = args.findIndex((a) => a === "--file");
const DEFAULT_FILE = path.resolve(
  __dirname,
  "..",
  "BDD SCI 07.04.26 - BDD - loyers actuels complétés.xlsx",
);
const FILE_PATH = fileArgIdx >= 0 ? args[fileArgIdx + 1] : DEFAULT_FILE;

// ============================================================
// Helpers
// ============================================================

type IndiceType = "ILC" | "IRL" | "ILAT" | "ICC";

interface IndiceParsed {
  type: IndiceType | null;
  trimestre: string | null; // "2T2017" → on normalise en "2017-T2"
  valeur: number | null;
}

/** Parse "ILC 2T2017 = 110" / "IRL 3T2023 = 141,03" / "ICC" → composants. */
function parseIndice(raw: unknown): IndiceParsed {
  const empty: IndiceParsed = { type: null, trimestre: null, valeur: null };
  if (raw == null) return empty;
  const s = String(raw).trim();
  if (!s) return empty;

  // Type (premier token)
  const typeMatch = s.match(/^(ILC|IRL|ILAT|ICC)\b/i);
  const type = (typeMatch ? typeMatch[1].toUpperCase() : null) as IndiceType | null;

  // Trimestre : "2T2017" ou "T2 2017" → normalise en "2017-T2"
  const trimMatch = s.match(/([1-4])\s*T\s*(\d{4})/i);
  const trimestre = trimMatch ? `${trimMatch[2]}-T${trimMatch[1]}` : null;

  // Valeur après "="
  const valMatch = s.match(/=\s*([\d.,]+)/);
  let valeur: number | null = null;
  if (valMatch) {
    const n = parseFloat(valMatch[1].replace(/\s/g, "").replace(",", "."));
    valeur = Number.isFinite(n) ? n : null;
  }

  return { type, trimestre, valeur };
}

/** Normalise un libellé SCI xlsx → nom SCI DB.
 *  Le xlsx utilise "34 RUE HAUTE", "LEGRAND"…; la BDD utilise "SCI 34 RUE HAUTE" etc. */
function normalizeSciName(raw: unknown): string {
  const s = String(raw || "").trim().toUpperCase();
  // On préfixe avec "SCI " si ce n'est déjà le cas.
  return s.startsWith("SCI ") ? s : `SCI ${s}`;
}

function normalizeLocataireName(raw: unknown): string {
  return String(raw || "").trim();
}

function toNum(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toDateStr(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  // xlsx peut renvoyer un serial number si on ne passe pas cellDates:true,
  // ou une chaîne ISO si on le passe.
  const d = new Date(String(raw));
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ============================================================
// Data model côté xlsx
// ============================================================

interface XlsxBail {
  sciRaw: string;
  sciNorm: string;
  locataire: string;
  loyerDepart: number | null;
  loyerActuelBudget: number | null;
  dateDebut: string | null;
  dateFin: string | null;
  indice: IndiceParsed;
  sourceRow: number;
}

// ============================================================
// Lecture xlsx
// ============================================================

function readXlsx(filePath: string): XlsxBail[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });

  // SYNTH = source de vérité pour la liste des baux + loyers.
  const synth = wb.Sheets["SYNTH"];
  if (!synth) throw new Error("Feuille SYNTH absente du xlsx");
  const synthRows: any[][] = XLSX.utils.sheet_to_json(synth, { header: 1, raw: true });

  // BDD = source d'information pour les indices (champ libre).
  const bdd = wb.Sheets["BDD"];
  const bddRows: any[][] = bdd
    ? (XLSX.utils.sheet_to_json(bdd, { header: 1, raw: true }) as any[][])
    : [];

  // Détecte dynamiquement la ligne de header (celle qui contient littéralement
  // "SCI" en colonne A ET "Locataire" quelque part dans la ligne). xlsx
  // strip les lignes totalement vides en tête, l'index n'est donc pas fiable.
  function findHeaderRow(rows: any[][]): number {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      if (String(row[0] ?? "").trim().toUpperCase() === "SCI") {
        const hasLocataire = row
          .some((c) => String(c ?? "").trim().toUpperCase().startsWith("LOCATAIRE"));
        if (hasLocataire) return i;
      }
    }
    return -1;
  }

  const synthHeader = findHeaderRow(synthRows);
  if (synthHeader < 0) throw new Error("Header SYNTH introuvable (ligne 'SCI … Locataire')");
  const bddHeader = findHeaderRow(bddRows);

  // Build indice lookup from BDD keyed by (SCI, locataire).
  // Colonnes BDD (0-indexed à partir du header détecté) :
  //   0  SCI
  //   15 Locataire
  //   18 Loyer annuel de départ
  //   20 indice revalorisation loyers
  const indiceMap = new Map<string, IndiceParsed>();
  if (bddHeader >= 0) {
    for (let i = bddHeader + 1; i < bddRows.length; i++) {
      const row = bddRows[i];
      if (!row || !row[0] || !row[15]) continue;
      const key = `${normalizeSciName(row[0])}::${normalizeLocataireName(row[15]).toUpperCase()}`;
      indiceMap.set(key, parseIndice(row[20]));
    }
  }

  // Parse SYNTH rows. Colonnes :
  //   0 SCI | 5 Locataire | 6 date début | 7 date fin |
  //   8 Loyer départ | 9 Loyer actuel HC (budget)
  const result: XlsxBail[] = [];
  for (let i = synthHeader + 1; i < synthRows.length; i++) {
    const row = synthRows[i];
    if (!row || !row[0] || !row[5]) continue;
    const sciNorm = normalizeSciName(row[0]);
    const locataire = normalizeLocataireName(row[5]);
    const key = `${sciNorm}::${locataire.toUpperCase()}`;
    result.push({
      sciRaw: String(row[0]),
      sciNorm,
      locataire,
      loyerDepart: toNum(row[8]),
      loyerActuelBudget: toNum(row[9]),
      dateDebut: toDateStr(row[6]),
      dateFin: toDateStr(row[7]),
      indice: indiceMap.get(key) ?? { type: null, trimestre: null, valeur: null },
      sourceRow: i + 1,
    });
  }

  return result;
}

// ============================================================
// Résolution en base + diff
// ============================================================

interface Diff {
  xlsx: XlsxBail;
  bailId: string | null;
  bailNom: string | null;
  matched: "db" | "not-found" | "ambiguous";
  candidates: number;
  changes: Record<string, { before: unknown; after: unknown }>;
  warnings: string[];
}

async function diffXlsxVsDb(xlsxBaux: XlsxBail[]): Promise<Diff[]> {
  const diffs: Diff[] = [];

  // Précharge SCIs (par nom, upper-case)
  const allScis = await db.select().from(scis);
  const sciByName = new Map<string, string>();
  for (const s of allScis) {
    if (s.nom) sciByName.set(s.nom.trim().toUpperCase(), s.id);
  }

  // Précharge locataires (par nom, upper-case)
  const allLocs = await db.select().from(locatairesGL);

  for (const x of xlsxBaux) {
    const diff: Diff = {
      xlsx: x,
      bailId: null,
      bailNom: null,
      matched: "not-found",
      candidates: 0,
      changes: {},
      warnings: [],
    };

    const sciId = sciByName.get(x.sciNorm.toUpperCase());
    if (!sciId) {
      diff.warnings.push(`SCI "${x.sciNorm}" introuvable en base`);
      diffs.push(diff);
      continue;
    }

    // Cherche le bail : scope='am' + sciId + locataire.nom ~ xlsx.locataire
    const locKey = x.locataire.trim().toUpperCase();
    const matchingLocs = allLocs.filter(
      (l) => (l.nom || "").trim().toUpperCase() === locKey,
    );

    let candidates: { id: string; nom: string | null }[] = [];
    if (matchingLocs.length > 0) {
      const locIds = new Set(matchingLocs.map((l) => l.id));
      const baux = await db
        .select()
        .from(bauxGL)
        .where(and(eq(bauxGL.sciId, sciId), eq(bauxGL.scope, "am")));
      candidates = baux
        .filter((b) => b.locataireId && locIds.has(b.locataireId) && !b.archived)
        .map((b) => ({ id: b.id, nom: b.nom }));
    }

    diff.candidates = candidates.length;
    if (candidates.length === 0) {
      diff.matched = "not-found";
      diffs.push(diff);
      continue;
    }
    if (candidates.length > 1) {
      diff.matched = "ambiguous";
      diff.warnings.push(`${candidates.length} baux candidats — import ignoré pour éviter les écrasements`);
      diffs.push(diff);
      continue;
    }

    // Match unique
    diff.matched = "db";
    diff.bailId = candidates[0].id;
    diff.bailNom = candidates[0].nom;

    // Récupère les valeurs actuelles
    const [current] = await db.select().from(bauxGL).where(eq(bauxGL.id, diff.bailId));
    if (!current) continue;

    // Diff loyer_base_ht
    if (x.loyerDepart != null) {
      const cur = current.loyerBaseHT != null ? Number(current.loyerBaseHT) : null;
      if (cur == null || Math.abs(cur - x.loyerDepart) > 0.5) {
        diff.changes.loyerBaseHT = { before: cur, after: x.loyerDepart };
      }
    } else {
      diff.warnings.push("loyer_depart vide dans xlsx — ignoré");
    }

    // Diff indice (type + trimestre + valeur)
    if (x.indice.type && current.indiceReference !== x.indice.type) {
      diff.changes.indiceReference = { before: current.indiceReference, after: x.indice.type };
    }
    if (x.indice.trimestre && current.trimestreRef !== x.indice.trimestre) {
      diff.changes.trimestreRef = { before: current.trimestreRef, after: x.indice.trimestre };
    }
    if (x.indice.valeur != null) {
      const cur = current.valeurIndiceBase != null ? Number(current.valeurIndiceBase) : null;
      if (cur == null || Math.abs(cur - x.indice.valeur) > 0.01) {
        diff.changes.valeurIndiceBase = { before: cur, after: x.indice.valeur };
      }
    }

    // Indice incomplet → warning
    if (x.indice.type && (!x.indice.trimestre || x.indice.valeur == null)) {
      diff.warnings.push(
        `indice ${x.indice.type} incomplet (trimestre=${x.indice.trimestre ?? "∅"}, valeur=${x.indice.valeur ?? "∅"}) — saisie manuelle requise`,
      );
    }
    if (!x.indice.type) {
      diff.warnings.push("aucun indice dans BDD — indexation auto impossible");
    }

    diffs.push(diff);
  }

  return diffs;
}

// ============================================================
// Application des changements
// ============================================================

async function applyDiffs(diffs: Diff[]): Promise<number> {
  let applied = 0;
  for (const d of diffs) {
    if (d.matched !== "db" || !d.bailId) continue;
    if (Object.keys(d.changes).length === 0) continue;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(d.changes)) {
      // Les colonnes numeric sont stockées en string côté Drizzle.
      patch[k] =
        typeof v.after === "number" ? String(v.after) : (v.after as unknown);
    }

    await db.update(bauxGL).set(patch as any).where(eq(bauxGL.id, d.bailId));
    applied++;
  }
  return applied;
}

// ============================================================
// Rapport console
// ============================================================

function formatReport(diffs: Diff[]): string {
  const lines: string[] = [];
  let nMatched = 0,
    nNotFound = 0,
    nAmbiguous = 0,
    nWithChanges = 0;

  for (const d of diffs) {
    if (d.matched === "db") nMatched++;
    else if (d.matched === "not-found") nNotFound++;
    else if (d.matched === "ambiguous") nAmbiguous++;
    if (Object.keys(d.changes).length > 0) nWithChanges++;
  }

  lines.push("");
  lines.push("════════════════════════════════════════════════════════════════");
  lines.push(`  RAPPORT IMPORT BDD-AM — ${APPLY ? "APPLY" : "DRY-RUN"}`);
  lines.push("════════════════════════════════════════════════════════════════");
  lines.push(
    `  Baux xlsx       : ${diffs.length}`,
  );
  lines.push(`  Match unique    : ${nMatched}`);
  lines.push(`  Non trouvés     : ${nNotFound}`);
  lines.push(`  Ambigus (>1)    : ${nAmbiguous}`);
  lines.push(`  Avec changements: ${nWithChanges}`);
  lines.push("────────────────────────────────────────────────────────────────");

  for (const d of diffs) {
    const status =
      d.matched === "db"
        ? "✅"
        : d.matched === "ambiguous"
          ? "⚠️ "
          : "❌";
    const label = `${status}  [${d.xlsx.sciNorm}] ${d.xlsx.locataire}`;
    lines.push("");
    lines.push(label);
    if (d.matched !== "db") {
      lines.push(`     ${d.matched === "ambiguous" ? `${d.candidates} candidats` : "aucun bail en base"}`);
    } else if (Object.keys(d.changes).length === 0) {
      lines.push("     (déjà à jour)");
    } else {
      for (const [k, v] of Object.entries(d.changes)) {
        lines.push(`     • ${k}: ${v.before ?? "∅"}  →  ${v.after}`);
      }
    }
    for (const w of d.warnings) {
      lines.push(`     ⚠  ${w}`);
    }
  }

  lines.push("");
  lines.push("════════════════════════════════════════════════════════════════");
  return lines.join("\n");
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`📂 Lecture : ${FILE_PATH}`);
  const xlsxBaux = readXlsx(FILE_PATH);
  console.log(`   ${xlsxBaux.length} baux extraits`);

  const diffs = await diffXlsxVsDb(xlsxBaux);
  console.log(formatReport(diffs));

  if (!APPLY) {
    console.log("ℹ️  Mode DRY-RUN — aucune écriture. Relancer avec --apply pour appliquer.");
    return;
  }

  const applied = await applyDiffs(diffs);
  console.log(`✅ ${applied} baux mis à jour en base.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Import échoué :", err);
    process.exit(1);
  });
