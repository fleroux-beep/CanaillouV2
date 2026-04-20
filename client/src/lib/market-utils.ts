/**
 * Utilitaires pour les données de marché.
 * Comparaison actifs vs référentiel, badges, fallbacks.
 */

export interface RefTauxEmprunt {
  id: string;
  source: string;
  typeActif: string;
  dureeAns: number;
  taux: string;
  periode?: string | null;
  dateReleve?: string | null;
}

export interface RefValeurVenale {
  id: string;
  source: string;
  codePostal: string;
  ville?: string | null;
  typeBien: string;
  prixM2Median?: string | null;
  prixM2Bas?: string | null;
  prixM2Haut?: string | null;
  nbTransactions?: number | null;
  periode?: string | null;
}

export interface RefValeurLocative {
  id: string;
  source: string;
  codePostal: string;
  ville?: string | null;
  typeBien: string;
  loyerM2MensuelMedian?: string | null;
  loyerM2MensuelBas?: string | null;
  loyerM2MensuelHaut?: string | null;
  periode?: string | null;
}

export interface RefTauxCapi {
  id: string;
  source: string;
  codePostal: string;
  ville?: string | null;
  typeBien: string;
  tauxCapi: string;
  tauxCapiBas?: string | null;
  tauxCapiHaut?: string | null;
  fiabilite?: string | null;
  methodeCalcul?: string | null;
  periode?: string | null;
}

// ============================================================
// Lookups
// ============================================================

/** Map actif type → ref type mapping */
function mapActifTypeToRefType(actifType: string | undefined | null): string[] {
  const t = (actifType || "").toLowerCase();
  if (t.includes("résidentiel") || t.includes("residentiel") || t.includes("habitation")) {
    return ["appartement", "maison"];
  }
  if (t.includes("commercial") || t.includes("commerce")) return ["local_commercial"];
  if (t.includes("bureau")) return ["bureau"];
  if (t.includes("crèche") || t.includes("creche") || t.includes("erp")) return ["crèche"];
  if (t.includes("mixte")) return ["appartement", "local_commercial"];
  return ["appartement"]; // default
}

/** Find best matching taux emprunt for an actif type + duration */
export function findRefTauxEmprunt(
  refs: RefTauxEmprunt[],
  typeActif: string | undefined | null,
  dureeAns: number | undefined | null,
): RefTauxEmprunt | null {
  const type = (typeActif || "résidentiel").toLowerCase();
  const duree = dureeAns || 20;

  // Exact match first
  const match = refs.find((r) => r.typeActif.toLowerCase() === type && r.dureeAns === duree);
  if (match) return match;

  // Same type, closest duration
  const sameType = refs.filter((r) => r.typeActif.toLowerCase() === type);
  if (sameType.length > 0) {
    sameType.sort((a, b) => Math.abs(a.dureeAns - duree) - Math.abs(b.dureeAns - duree));
    return sameType[0];
  }

  // Fallback: résidentiel
  const fallback = refs.filter((r) => r.typeActif.toLowerCase().includes("résidentiel") || r.typeActif.toLowerCase().includes("residentiel"));
  if (fallback.length > 0) {
    fallback.sort((a, b) => Math.abs(a.dureeAns - duree) - Math.abs(b.dureeAns - duree));
    return fallback[0];
  }

  return null;
}

/** Find best matching prix/m² for a code postal + actif type */
export function findRefPrixM2(
  refs: RefValeurVenale[],
  codePostal: string | undefined | null,
  actifType: string | undefined | null,
): RefValeurVenale | null {
  if (!codePostal) return null;
  const types = mapActifTypeToRefType(actifType);

  for (const t of types) {
    const match = refs.find((r) => r.codePostal === codePostal && r.typeBien === t);
    if (match) return match;
  }
  // Any match for this code postal
  const anyMatch = refs.find((r) => r.codePostal === codePostal);
  return anyMatch || null;
}

/** Find best matching loyer/m² for a code postal + actif type */
export function findRefLoyerM2(
  refs: RefValeurLocative[],
  codePostal: string | undefined | null,
  actifType: string | undefined | null,
): RefValeurLocative | null {
  if (!codePostal) return null;
  const types = mapActifTypeToRefType(actifType);

  for (const t of types) {
    const match = refs.find((r) => r.codePostal === codePostal && r.typeBien === t);
    if (match) return match;
  }
  const anyMatch = refs.find((r) => r.codePostal === codePostal);
  return anyMatch || null;
}

/** Find best matching taux capi for a code postal + actif type */
export function findRefTauxCapi(
  refs: RefTauxCapi[],
  codePostal: string | undefined | null,
  actifType: string | undefined | null,
): RefTauxCapi | null {
  if (!codePostal) return null;
  const types = mapActifTypeToRefType(actifType);

  // Prefer manual > immostat > calculated
  const priorityOrder = ["manuel", "immostat", "calculé"];

  for (const source of priorityOrder) {
    for (const t of types) {
      const match = refs.find((r) => r.codePostal === codePostal && r.typeBien === t && r.source === source);
      if (match) return match;
    }
  }

  // Any match for this code postal
  for (const source of priorityOrder) {
    const match = refs.find((r) => r.codePostal === codePostal && r.source === source);
    if (match) return match;
  }

  const anyMatch = refs.find((r) => r.codePostal === codePostal);
  return anyMatch || null;
}

// ============================================================
// Badge helpers
// ============================================================

export type MarketBadgeLevel = "good" | "neutral" | "warning" | "danger";

export interface MarketComparison {
  level: MarketBadgeLevel;
  label: string;
  detail: string;
}

/** Compare emprunt rate vs market rate */
export function compareTauxEmprunt(
  tauxEmprunt: number,
  tauxMarche: number,
): MarketComparison {
  const diff = tauxEmprunt - tauxMarche;
  const diffBp = Math.round(diff * 100);

  if (diff <= -0.25) return { level: "good", label: `${diffBp}bp`, detail: `Votre taux: ${tauxEmprunt.toFixed(2)}% / Marché: ${tauxMarche.toFixed(2)}%` };
  if (diff <= 0.25) return { level: "neutral", label: "= Marché", detail: `Votre taux: ${tauxEmprunt.toFixed(2)}% / Marché: ${tauxMarche.toFixed(2)}%` };
  if (diff <= 0.75) return { level: "warning", label: `+${diffBp}bp`, detail: `Votre taux: ${tauxEmprunt.toFixed(2)}% / Marché: ${tauxMarche.toFixed(2)}%` };
  return { level: "danger", label: `+${diffBp}bp`, detail: `Votre taux: ${tauxEmprunt.toFixed(2)}% / Marché: ${tauxMarche.toFixed(2)}%` };
}

/** Compare loyer réel vs loyer marché — potentiel de réversion */
export function compareLoyerMarche(
  loyerReelM2: number,
  loyerMarcheM2: number,
): MarketComparison {
  if (loyerMarcheM2 <= 0) return { level: "neutral", label: "N/A", detail: "Pas de donnée marché" };
  const diff = ((loyerReelM2 - loyerMarcheM2) / loyerMarcheM2) * 100;

  if (diff >= 0) return { level: "good", label: `+${diff.toFixed(0)}%`, detail: `Loyer: ${loyerReelM2.toFixed(0)}€/m² / Marché: ${loyerMarcheM2.toFixed(0)}€/m²` };
  if (diff >= -10) return { level: "neutral", label: `${diff.toFixed(0)}%`, detail: `Loyer: ${loyerReelM2.toFixed(0)}€/m² / Marché: ${loyerMarcheM2.toFixed(0)}€/m²` };
  if (diff >= -20) return { level: "warning", label: `${diff.toFixed(0)}%`, detail: `Loyer: ${loyerReelM2.toFixed(0)}€/m² / Marché: ${loyerMarcheM2.toFixed(0)}€/m² — potentiel de réversion` };
  return { level: "danger", label: `${diff.toFixed(0)}%`, detail: `Loyer: ${loyerReelM2.toFixed(0)}€/m² / Marché: ${loyerMarcheM2.toFixed(0)}€/m² — sous-loué` };
}

/** Badge color mapping */
export function badgeVariant(level: MarketBadgeLevel): "default" | "success" | "warning" | "danger" | "outline" {
  switch (level) {
    case "good": return "success";
    case "neutral": return "default";
    case "warning": return "warning";
    case "danger": return "danger";
  }
}

/** Source badge color */
export function sourceBadgeColor(source: string): string {
  switch (source) {
    case "bdf":
    case "dvf":
    case "anil":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "calculé":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "manuel":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "immostat":
    case "oll":
    case "interne":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Source label */
export function sourceLabel(source: string): string {
  switch (source) {
    case "bdf": return "Banque de France";
    case "dvf": return "DVF";
    case "anil": return "ANIL";
    case "calculé": return "Calculé";
    case "manuel": return "Manuel";
    case "immostat": return "ImmoStat";
    case "oll": return "OLL";
    case "interne": return "Portefeuille";
    default: return source;
  }
}
