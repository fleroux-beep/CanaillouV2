/**
 * Source de vérité unique pour le calcul du loyer annuel d'un bail.
 * Partagé client + serveur pour garantir qu'une route API et la UI
 * renvoient toujours la même valeur.
 *
 * Priorité (cf. REGLES_METIER.md §1.3) :
 *   1. `loyerManuelOverride` — uniquement si `forceManual === true` ET > 0
 *   2. `loyerHTActu`         — loyer courant indexé INSEE
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
export function isResilie(statut: string | null | undefined): boolean {
  if (!statut) return false;
  return statut.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "resilie";
}

export function getBailLoyer(b: BailLoyerFields | null | undefined): number {
  if (!b) return 0;
  if (b.forceManual) {
    const override = toNumberSafe(b.loyerManuelOverride);
    if (override > 0) return override;
  }
  const actu = toNumberSafe(b.loyerHTActu);
  if (actu > 0) return actu;
  return toNumberSafe(b.loyerBaseHT);
}
