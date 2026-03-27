/**
 * Infrastructure commune pour les scrapers immobiliers.
 *
 * Utilise Playwright (headless Chromium) pour exécuter le JavaScript
 * des SPA (LeBonCoin, SeLoger, etc.) et extraire les données réelles.
 *
 * Le chemin vers Chromium est configurable via CHROMIUM_PATH.
 * Si aucun navigateur n'est disponible, les scrapers sont désactivés
 * et retournent un tableau vide (fail gracieux, pas de crash).
 */
import { chromium, type Browser, type Page, type BrowserContext } from "playwright-core";
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
  typeBien: string;
  rayonKm: number;
  surface?: number;
}

// ============================================================
// Playwright browser pool (singleton)
// ============================================================

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_PATH || "";

let browserInstance: Browser | null = null;
let browserAvailable: boolean | null = null; // null = not checked yet

/**
 * Retourne une instance partagée du navigateur Chromium.
 * Retourne null si Chromium n'est pas disponible.
 */
const BROWSER_LAUNCH_TIMEOUT_MS = 15_000; // 15s max pour lancer Chromium

async function launchWithTimeout(opts: Record<string, any>): Promise<Browser> {
  return Promise.race([
    chromium.launch(opts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Chromium launch timeout")), BROWSER_LAUNCH_TIMEOUT_MS),
    ),
  ]);
}

async function getBrowser(): Promise<Browser | null> {
  if (browserAvailable === false) return null;

  if (browserInstance?.isConnected()) return browserInstance;

  // Trouver le chemin Chromium
  let executablePath = CHROMIUM_PATH;

  if (!executablePath) {
    // Essayer les chemins courants
    const { existsSync } = await import("fs");
    const candidates = [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/snap/bin/chromium",
      "/usr/local/bin/chromium",
    ];
    executablePath = candidates.find((p) => existsSync(p)) || "";
  }

  if (!executablePath) {
    // Pas de binaire trouvé — marquer indisponible immédiatement (pas de tentative auto)
    browserAvailable = false;
    logger.warn("Playwright: aucun navigateur Chromium trouvé — scrapers Phase 2 désactivés. " +
      "Installez Chromium ou définissez CHROMIUM_PATH.");
    return null;
  }

  try {
    browserInstance = await launchWithTimeout({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    browserAvailable = true;
    logger.info(`Playwright: navigateur Chromium lancé (${executablePath})`);
    return browserInstance;
  } catch (err: any) {
    browserAvailable = false;
    logger.warn(`Playwright: impossible de lancer Chromium (${executablePath}): ${err.message}`);
    return null;
  }
}

/**
 * Ferme proprement le navigateur (appelé à l'arrêt du serveur).
 */
/**
 * Tente de lancer le navigateur si pas encore vérifié, puis retourne la dispo.
 */
export async function ensureBrowserChecked(): Promise<boolean> {
  if (browserAvailable === null) await getBrowser();
  return browserAvailable === true;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// Nettoyage à l'arrêt
process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

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

function randomUserAgent(): string {
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

async function rateLimitedWait(domain: string): Promise<void> {
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
// Page Playwright avec navigation
// ============================================================

export interface PageResult {
  html: string;
  url: string;
}

/**
 * Ouvre une page Playwright, navigue vers l'URL et attend le rendu JS.
 * Retourne le HTML complet après rendu, ou null si indisponible.
 *
 * @param url URL à charger
 * @param options Configuration de la navigation
 */
export async function fetchPage(
  url: string,
  options: {
    domain: string;
    timeoutMs?: number;
    waitForSelector?: string;     // Attendre qu'un sélecteur soit visible
    waitForNetworkIdle?: boolean; // Attendre que le réseau soit calme
  },
): Promise<PageResult | null> {
  const { domain, timeoutMs = 30000, waitForSelector, waitForNetworkIdle = true } = options;

  const browser = await getBrowser();
  if (!browser) return null;

  await rateLimitedWait(domain);

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      userAgent: randomUserAgent(),
      locale: "fr-FR",
      viewport: { width: 1920, height: 1080 },
      // Bloquer les ressources lourdes non nécessaires
      bypassCSP: true,
    });

    page = await context.newPage();

    // Bloquer les images, fonts, médias pour accélérer
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    // Navigation
    const waitUntil = waitForNetworkIdle ? "networkidle" : "domcontentloaded";
    await page.goto(url, { waitUntil, timeout: timeoutMs });

    // Attendre un sélecteur spécifique si demandé
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
        // Le sélecteur n'est pas apparu — on continue avec ce qu'on a
      });
    }

    // Petit délai pour laisser les derniers rendus JS se terminer
    await page.waitForTimeout(1500);

    const html = await page.content();
    const finalUrl = page.url();

    return { html, url: finalUrl };
  } catch (err: any) {
    logger.warn(`Playwright fetch failed for ${domain}: ${err.message}`);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Fallback : simple fetch HTTP (pour les pages SSR qui n'ont pas besoin de JS).
 */
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
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          ...headers,
        },
        redirect: "follow",
      });

      if (response.status === 429) {
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

// ============================================================
// Validation de plausibilité des prix/m²
// ============================================================

/**
 * Plages de plausibilité prix/m² par type de transaction.
 * Permet de filtrer les valeurs aberrantes (ex: prix de vente capturé comme loyer).
 */
const PLAUSIBILITY_RANGES = {
  vente: { min: 200, max: 30000 },      // €/m² — de la campagne profonde au luxe parisien
  location: { min: 3, max: 80 },         // €/m²/mois — loyer mensuel raisonnable
  location_annual: { min: 30, max: 1000 }, // €/m²/an — loyer annuel (commercial)
};

/**
 * Filtre les prix/m² selon la plausibilité pour le type de transaction.
 * Retourne un objet avec les valeurs filtrées et les stats de rejet.
 */
export function filterPlausiblePrixM2(
  prixM2Values: number[],
  typeRecherche: "vente" | "location",
  isCommercial: boolean = false,
): { values: number[]; rejected: number; reason?: string } {
  if (prixM2Values.length === 0) return { values: [], rejected: 0 };

  if (typeRecherche === "vente") {
    const range = PLAUSIBILITY_RANGES.vente;
    const filtered = prixM2Values.filter((v) => v >= range.min && v <= range.max);
    return {
      values: filtered,
      rejected: prixM2Values.length - filtered.length,
      reason: filtered.length < prixM2Values.length
        ? `${prixM2Values.length - filtered.length} valeur(s) hors plage vente [${range.min}-${range.max} €/m²]`
        : undefined,
    };
  }

  // Location : tester d'abord si c'est du mensuel, sinon annuel
  const monthlyRange = PLAUSIBILITY_RANGES.location;
  const monthlyFiltered = prixM2Values.filter((v) => v >= monthlyRange.min && v <= monthlyRange.max);

  if (monthlyFiltered.length > 0) {
    return {
      values: monthlyFiltered,
      rejected: prixM2Values.length - monthlyFiltered.length,
      reason: monthlyFiltered.length < prixM2Values.length
        ? `${prixM2Values.length - monthlyFiltered.length} valeur(s) hors plage loyer mensuel [${monthlyRange.min}-${monthlyRange.max} €/m²/mois]`
        : undefined,
    };
  }

  // Aucune valeur mensuelle plausible — tester si annuel (commercial)
  if (isCommercial) {
    const annualRange = PLAUSIBILITY_RANGES.location_annual;
    const annualFiltered = prixM2Values.filter((v) => v >= annualRange.min && v <= annualRange.max);
    if (annualFiltered.length > 0) {
      // Convertir en mensuel
      const monthlyValues = annualFiltered.map((v) => Math.round((v / 12) * 100) / 100);
      return {
        values: monthlyValues,
        rejected: prixM2Values.length - annualFiltered.length,
        reason: `Valeurs interprétées comme loyer annuel, converties en mensuel (÷12)`,
      };
    }
  }

  // Rien de plausible — tout rejeter
  return {
    values: [],
    rejected: prixM2Values.length,
    reason: `Toutes les valeurs (${prixM2Values.slice(0, 5).join(", ")}...) hors plages de plausibilité — probablement des prix de vente captés comme loyers`,
  };
}

/**
 * Map le type d'actif Canaillou vers les types recherchés par les plateformes.
 */
export function mapActifTypeToSearch(type: string): {
  typeBien: string;
  searchTypes: string[];
  dvfCompatible: boolean;
  anilCompatible: boolean;
} {
  const t = (type || "").toLowerCase();
  if (t === "résidentiel" || t === "residentiel" || t === "habitation") {
    return { typeBien: "appartement", searchTypes: ["appartement", "maison"], dvfCompatible: true, anilCompatible: true };
  }
  if (t === "commercial" || t === "commerce") {
    return { typeBien: "local_commercial", searchTypes: ["local_commercial", "commerce"], dvfCompatible: true, anilCompatible: false };
  }
  if (t === "bureau") {
    return { typeBien: "bureau", searchTypes: ["bureau"], dvfCompatible: false, anilCompatible: false };
  }
  if (t === "mixte") {
    return { typeBien: "appartement", searchTypes: ["appartement", "local_commercial"], dvfCompatible: true, anilCompatible: true };
  }
  if (t === "crèche" || t === "creche") {
    return { typeBien: "local_commercial", searchTypes: ["local_commercial"], dvfCompatible: true, anilCompatible: false };
  }
  return { typeBien: "appartement", searchTypes: ["appartement"], dvfCompatible: true, anilCompatible: true };
}

// ============================================================
// Utilitaire : slugification des noms de ville pour URL
// ============================================================

/**
 * Transforme un nom de ville français en slug URL valide.
 * Gère les accents, apostrophes, espaces et caractères spéciaux.
 *
 * Exemples :
 *  - "Paris"           → "paris"
 *  - "Saint-Étienne"   → "saint-etienne"
 *  - "L'Isle-Adam"     → "l-isle-adam"
 *  - "Aix en Provence" → "aix-en-provence"
 *  - "Château-d'Oléron"→ "chateau-d-oleron"
 */
export function slugifyVille(ville: string): string {
  return ville
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // supprimer les diacritiques
    .replace(/[''`]/g, "-")            // apostrophes → tirets
    .replace(/[^a-z0-9-]/g, "-")       // tout caractère non-alphanum → tiret
    .replace(/-{2,}/g, "-")            // tirets multiples → un seul
    .replace(/^-|-$/g, "");            // pas de tiret en début/fin
}

// ============================================================
// Interface scraper
// ============================================================

export interface Scraper {
  name: string;
  scrape(ctx: ScrapingContext): Promise<ScrapedResult[]>;
}
