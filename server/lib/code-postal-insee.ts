/**
 * Mapping code postal → code(s) INSEE pour les cas non triviaux.
 * Pour la grande majorité des communes, code postal = code INSEE.
 * Les exceptions sont : Paris (75xxx → 751xx), Lyon (6900x → 6938x),
 * Marseille (1300x → 132xx), et les communes fusionnées.
 */

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

/**
 * Convertit un code postal en code(s) INSEE probables.
 * Retourne un tableau car un CP peut couvrir plusieurs communes.
 * Pour la plupart des communes, retourne [codePostal] tel quel.
 */
export function codePostalToInsee(codePostal: string): string[] {
  const cp = codePostal.trim();
  if (!cp || cp.length !== 5) return [cp];

  // Paris
  if (cp.startsWith("750") && cp !== "75000") return parisInsee(cp);
  // Lyon
  if (cp.startsWith("6900") && cp !== "69000") return lyonInsee(cp);
  // Marseille
  if (cp.startsWith("1300") && parseInt(cp.slice(3), 10) <= 16 && cp !== "13000") return marseilleInsee(cp);

  // Default: code postal = code INSEE (works for most communes)
  return [cp];
}

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
