/**
 * Source de vérité unique pour le calcul du loyer annuel d'un bail.
 * Partagé client + serveur pour garantir qu'une route API et la UI
 * renvoient toujours la même valeur.
 *
 * Priorité (cf. REGLES_METIER.md §1.3) :
 *   1. `loyerManuelOverride` — si `forceManual === true` ET valeur explicitement fournie
 *      (y compris 0 pour période de gratuité)
 *   2. `loyerHTActu`         — loyer courant indexé INSEE (si > 0)
 *   3. `loyerBaseHT`         — loyer de signature (fallback)
 */
export interface BailLoyerFields {
  loyerBaseHT?: string | number | null;
  loyerHTActu?: string | number | null;
  forceManual?: boolean | null;
  loyerManuelOverride?: string | number | null;
}

function toNumberSafe(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Accent-insensitive check for "résilié" / "resilie" / "Résilié" etc.
 */
export function isResilie(input: string | { statut?: string | null } | null | undefined): boolean {
  if (!input) return false;
  const statut = typeof input === "string" ? input : input.statut;
  if (!statut) return false;
  return statut.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "resilie";
}

export function getBailLoyer(b: BailLoyerFields | null | undefined): number {
  if (!b) return 0;
  if (b.forceManual) {
    // Override explicite : si forceManual=true et qu'une valeur est fournie
    // (y compris 0 pour indiquer une période de gratuité), on respecte cette valeur.
    // Auparavant 0 était silencieusement remplacé par loyerHTActu/loyerBaseHT.
    const raw = b.loyerManuelOverride;
    if (raw !== null && raw !== undefined && raw !== "") {
      const override = toNumberSafe(raw);
      if (override >= 0) return override;
    }
  }
  const actu = toNumberSafe(b.loyerHTActu);
  if (actu > 0) return actu;
  return toNumberSafe(b.loyerBaseHT);
}
