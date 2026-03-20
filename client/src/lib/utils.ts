import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safely convert to a finite number, defaulting to 0 */
function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

/** Format a number as currency (EUR) */
export function formatCurrency(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toSafeNumber(value));
}

/** Format a number as percentage (French locale: comma separator) */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Math.max(0, decimals),
    maximumFractionDigits: Math.max(0, decimals),
  }).format(toSafeNumber(value)) + " %";
}

/** Format a number with French locale */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toSafeNumber(value));
}
