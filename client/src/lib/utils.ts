import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as currency (EUR) */
export function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Format a number as percentage */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  const num = Number(value || 0);
  return `${num.toFixed(decimals)} %`;
}

/** Format a number with French locale */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const num = Number(value || 0);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
