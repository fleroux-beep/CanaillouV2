/**
 * Mapping code postal → code(s) INSEE.
 *
 * Problème fondamental : un code postal peut couvrir plusieurs communes,
 * et le code postal ≠ code INSEE (sauf exceptions).
 *
 * Exemples :
 *  - 95170 (CP) → Deuil-la-Barre (INSEE 95197) ET Condécourt (INSEE 95170)
 *  - 95150 (CP) → Taverny (INSEE 95607) ET Chaussy (INSEE 95150)
 *
 * On utilise l'API geo.api.gouv.fr pour résoudre le bon code INSEE
 * à partir du couple (code_postal, ville).
 *
 * Les cas spéciaux Paris/Lyon/Marseille restent gérés localement
 * (arrondissements → codes INSEE spécifiques).
 */

import { logger } from "./logger";

// ─── Cas spéciaux (arrondissements) ─────────────────────────

/** Paris : 75001-75020 → 75101-75120 */
function parisInsee(cp: string): string[] {
  const n = parseInt(cp.slice(2), 10); // 01..20
  if (n >= 1 && n <= 20) return [`751${String(n).padStart(2, "0")}`];
  return [cp];
}

/** Lyon : 69001-69009 → 69381-69389 */
function lyonInsee(cp: string): string[] {
  const n = parseInt(cp.slice(3), 10); // 1..9
  if (n >= 1 && n <= 9) return [`6938${n}`];
  return [cp];
}

/** Marseille : 13001-13016 → 13201-13216 */
function marseilleInsee(cp: string): string[] {
  const n = parseInt(cp.slice(3), 10);
  if (n >= 1 && n <= 16) return [`132${String(n).padStart(2, "0")}`];
  return [cp];
}

// ─── Fallback synchrone (Paris/Lyon/Marseille uniquement) ───

/**
 * Inverse: code INSEE → code postal pour l'affichage.
 */
export function inseeToCodePostal(codeInsee: string): string {
  const ci = codeInsee.trim();
  // Paris: 751xx → 750xx
  if (ci.startsWith("751") && ci.length === 5) {
    return `750${ci.slice(3)}`;
  }
  // Lyon: 6938x → 6900x
  if (ci.startsWith("6938") && ci.length === 5) {
    return `6900${ci.slice(4)}`;
  }
  // Marseille: 132xx → 130xx
  if (ci.startsWith("132") && ci.length === 5) {
    return `130${ci.slice(3)}`;
  }
  return ci;
}

// ─── Résolution async via geo.api.gouv.fr ───────────────────

interface GeoApiCommune {
  nom: string;
  code: string; // code INSEE
  codesPostaux: string[];
  codeDepartement: string;
  population?: number;
}

/**
 * Normalise un nom de ville pour comparaison fuzzy.
 * Supprime accents, tirets, "SAINT" vs "ST", etc.
 */
function normalizeVille(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toUpperCase()
    .replace(/[-']/g, " ")
    .replace(/\bSAINT\b/g, "ST")
    .replace(/\bSAINTE\b/g, "STE")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Résout le code INSEE d'une commune à partir de son code postal et nom de ville.
 * Interroge geo.api.gouv.fr pour obtenir la liste des communes du code postal,
 * puis fait un matching sur le nom de ville.
 *
 * Retourne le code INSEE ou null si non trouvé.
 */
export async function resolveInsee(
  codePostal: string,
  ville: string,
): Promise<string | null> {
  const cp = codePostal.trim();
  if (!cp || cp.length !== 5) return null;

  // Cas spéciaux Paris/Lyon/Marseille — résolution déterministe
  if (cp.startsWith("750") && cp !== "75000") return parisInsee(cp)[0];
  if (cp.startsWith("6900") && cp !== "69000") return lyonInsee(cp)[0];
  if (cp.startsWith("1300") && parseInt(cp.slice(3), 10) <= 16 && cp !== "13000") return marseilleInsee(cp)[0];

  try {
    const url = `https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,code,codesPostaux,codeDepartement,population`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      logger.warn(`geo.api.gouv.fr: HTTP ${response.status} for CP ${cp}`);
      return cp; // Fallback: use code postal as INSEE
    }

    const communes: GeoApiCommune[] = await response.json();

    if (communes.length === 0) {
      logger.warn(`geo.api.gouv.fr: no commune found for CP ${cp}`);
      return cp;
    }

    // If only one commune → no ambiguity
    if (communes.length === 1) {
      return communes[0].code;
    }

    // Multiple communes: match by ville name
    const normVille = normalizeVille(ville);

    // Exact match first
    const exact = communes.find((c) => normalizeVille(c.nom) === normVille);
    if (exact) return exact.code;

    // Contains match (e.g. "DEUIL LA BARRE" matches "Deuil-la-Barre")
    const contains = communes.find(
      (c) =>
        normalizeVille(c.nom).includes(normVille) ||
        normVille.includes(normalizeVille(c.nom)),
    );
    if (contains) return contains.code;

    // Word overlap match
    const villeWords = normVille.split(" ").filter((w) => w.length > 2);
    let bestMatch: GeoApiCommune | null = null;
    let bestScore = 0;
    for (const c of communes) {
      const cWords = normalizeVille(c.nom).split(" ").filter((w) => w.length > 2);
      const overlap = villeWords.filter((w) => cWords.includes(w)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestMatch = c;
      }
    }
    if (bestMatch && bestScore > 0) return bestMatch.code;

    // No match by name: pick the most populated commune as default
    const byPop = [...communes].sort((a, b) => (b.population || 0) - (a.population || 0));
    logger.warn(`geo.api.gouv.fr: no name match for "${ville}" in CP ${cp}, using most populated: ${byPop[0].nom} (${byPop[0].code})`);
    return byPop[0].code;
  } catch (err: any) {
    logger.warn(`geo.api.gouv.fr error for CP ${cp}: ${err.message}`);
    return cp; // Fallback
  }
}

/**
 * Résout les codes INSEE pour une liste de couples (codePostal, ville).
 * Retourne un mapping: code_insee → code_postal, et un set de tous les codes INSEE.
 */
export async function resolveAllInsee(
  actifPairs: { codePostal: string; ville: string }[],
): Promise<{ inseeToCP: Record<string, string>; allInsee: Set<string> }> {
  const inseeToCP: Record<string, string> = {};
  const allInsee = new Set<string>();

  for (const { codePostal, ville } of actifPairs) {
    const insee = await resolveInsee(codePostal, ville);
    if (insee) {
      inseeToCP[insee] = codePostal;
      allInsee.add(insee);
    }
  }

  return { inseeToCP, allInsee };
}
