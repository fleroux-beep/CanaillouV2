/**
 * Infrastructure commune pour les scrapers immobiliers.
 * Rate-limiting, cache mémoire, user-agent rotation, helpers HTTP.
 */
import { logger } from "../logger";

// ============================================================
// Types communs
// ============================================================

export interface ScrapedResult {
  source: string;
  typeRecherche: "vente" | "location";
  typeBien: string;
  prixM2Median?: number;
  prixM2Bas?: number;
  prixM2Haut?: number;
  loyerM2MensuelMedian?: number;
  loyerM2MensuelBas?: number;
  loyerM2MensuelHaut?: number;
  nbAnnonces?: number;
  tauxCapiDeduit?: number;
  rawData?: any;
  notes?: string;
}

export interface ScrapingContext {
  lat: number;
  lng: number;
  codePostal: string;
  ville: string;
  typeBien: string; // résidentiel → appartement, commercial → local_commercial, bureau → bureau, etc.
  rayonKm: number;
  surface?: number; // surface de l'actif pour affiner
}

// ============================================================
// User-Agent rotation
// ============================================================

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// Rate limiter — par domaine
// ============================================================

const lastRequestTime = new Map<string, number>();
const MIN_DELAY_MS: Record<string, number> = {
  "www.meilleursagents.com": 3000,
  "www.leboncoin.fr": 4000,
  "www.seloger.com": 3000,
  "www.pap.fr": 3000,
  "www.bureauxcommerces.seloger.com": 3000,
  "www.bureauxlocaux.com": 3000,
  default: 2000,
};

export async function rateLimitedWait(domain: string): Promise<void> {
  const delay = MIN_DELAY_MS[domain] || MIN_DELAY_MS.default;
  const last = lastRequestTime.get(domain) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < delay) {
    await new Promise((r) => setTimeout(r, delay - elapsed));
  }
  lastRequestTime.set(domain, Date.now());
}

// ============================================================
// Cache mémoire simple (TTL 24h)
// ============================================================

interface CacheEntry {
  data: any;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: any): void {
  cache.set(key, { data, ts: Date.now() });
}

// ============================================================
// Fetch helper avec retry + rate-limiting
// ============================================================

export async function fetchWithRetry(
  url: string,
  options: {
    domain: string;
    maxRetries?: number;
    timeoutMs?: number;
    headers?: Record<string, string>;
  },
): Promise<string | null> {
  const { domain, maxRetries = 2, timeoutMs = 15000, headers = {} } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimitedWait(domain);

      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": randomUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          ...headers,
        },
        redirect: "follow",
      });

      if (response.status === 429) {
        // Rate limited — wait exponentially
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 16000);
        logger.warn(`Rate limited by ${domain}, waiting ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        logger.warn(`${domain} HTTP ${response.status} for ${url}`);
        return null;
      }

      return await response.text();
    } catch (err: any) {
      if (attempt < maxRetries) {
        const waitMs = 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      logger.warn(`${domain} fetch failed after ${maxRetries + 1} attempts: ${err.message}`);
      return null;
    }
  }

  return null;
}

// ============================================================
// Helpers calcul
// ============================================================

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Calcule le taux de capitalisation à partir de prix vente/m² et loyer/m²/mois.
 */
export function computeTauxCapi(prixM2: number, loyerM2Mensuel: number): number | undefined {
  if (!prixM2 || !loyerM2Mensuel || prixM2 <= 0) return undefined;
  return Math.round(((loyerM2Mensuel * 12) / prixM2) * 10000) / 100;
}

/**
 * Map le type d'actif Canaillou vers les types recherchés par les plateformes.
 */
export function mapActifTypeToSearch(type: string): { typeBien: string; searchTypes: string[] } {
  const t = (type || "").toLowerCase();
  if (t === "résidentiel" || t === "residentiel") {
    return { typeBien: "appartement", searchTypes: ["appartement", "maison"] };
  }
  if (t === "commercial" || t === "commerce") {
    return { typeBien: "local_commercial", searchTypes: ["local_commercial", "commerce"] };
  }
  if (t === "bureau") {
    return { typeBien: "bureau", searchTypes: ["bureau"] };
  }
  if (t === "mixte") {
    return { typeBien: "appartement", searchTypes: ["appartement", "local_commercial"] };
  }
  if (t === "crèche" || t === "creche") {
    return { typeBien: "local_commercial", searchTypes: ["local_commercial"] };
  }
  return { typeBien: "appartement", searchTypes: ["appartement"] };
}

// ============================================================
// Interface scraper
// ============================================================

export interface Scraper {
  name: string;
  scrape(ctx: ScrapingContext): Promise<ScrapedResult[]>;
}
