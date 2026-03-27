import express from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { pool, db } from "./db";
import { ensureSchema } from "./ensure-schema";
import { users, scis, actifs } from "@shared/schema";
import { isNull } from "drizzle-orm";
import { registerAuthRoutes } from "./routes/auth";
import { registerAMRoutes } from "./routes/am";
import { registerMarcheRoutes } from "./routes/am-marche";
import { registerGLRoutes } from "./routes/gl";
import { registerImportRoutes } from "./routes/import";
import { registerChatRoutes } from "./routes/chat";
import { registerAlertesProactivesRoutes } from "./routes/alertes-proactives";
import { registerIndexationAutoRoutes } from "./routes/indexation-auto";
import { registerScoreSanteRoutes } from "./routes/score-sante";
import { registerBailPDFRoutes } from "./routes/bail-pdf";
import { registerProjectionsPredictivesRoutes } from "./routes/projections-predictives";
import { logger, requestLogger } from "./lib/logger";
import { requireAdmin } from "./middleware/auth";
import { startAutoSync } from "./lib/auto-sync-marche";
import helmet from "helmet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow inline scripts from Vite in dev
}));
const PORT = Number(process.env.PORT) || 5000;

// Logging
app.use(requestLogger);

// CORS — allow same-origin + dev proxy
app.use((_req, res, next) => {
  const origin = _req.headers.origin;
  if (origin) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
      }
    } catch {
      // Invalid origin URL — ignore
    }
  }
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Trust proxy (Railway, Heroku, etc. use a reverse proxy)
// Required for secure cookies to work behind a proxy
app.set("trust proxy", 1);

// Session
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET est requis en production");
}
const PgStore = ConnectPgSimple(session);
app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "dev-secret-local-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// API routes
registerAuthRoutes(app);
registerAMRoutes(app);
registerMarcheRoutes(app);
registerGLRoutes(app);
registerImportRoutes(app);
registerChatRoutes(app);
registerAlertesProactivesRoutes(app);
registerIndexationAutoRoutes(app);
registerScoreSanteRoutes(app);
registerBailPDFRoutes(app);
registerProjectionsPredictivesRoutes(app);

// Admin: import Excel SCI data (one-time migration)
app.post("/api/admin/import-excel", requireAdmin, async (_req, res) => {
  try {
    const { importExcelData } = await import("./import-excel");
    const counts = await importExcelData();
    res.json({ ok: true, counts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check (no DB dependency)
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});


// In production, serve the built frontend
if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  // In dev, Vite handles the frontend via proxy
  const { setupViteDevServer } = await import("./vite-dev");
  await setupViteDevServer(app);
}

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error("unhandled error", { error: err.message, stack: err.stack, url: _req.originalUrl });
  if (!res.headersSent) {
    res.status(500).json({
      error: "Erreur interne du serveur",
      ...(process.env.NODE_ENV !== "production" ? { detail: err.stack, url: _req.originalUrl } : {}),
    });
  }
});

// Seed default admin user if none exists (throws on failure for retry logic)
async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@canaillou.local";
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn("ADMIN_PASSWORD env var not set — skipping admin seed");
    return;
  }
  const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length === 0) {
    const hashed = await bcrypt.hash(adminPassword, 12);
    await db.insert(users).values({
      email: adminEmail,
      password: hashed,
      firstName: process.env.ADMIN_FIRST_NAME || "Admin",
      role: "admin",
      isApproved: true,
    });
    logger.info("admin user created", { email: adminEmail });
  }
}

// Retry helper for database operations (DB may not be ready when container starts)
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 5, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = error.message || error.code || String(error);
      if (i < retries - 1) {
        logger.warn(`${label} attempt ${i + 1}/${retries} failed: ${msg} — retrying in ${delayMs / 1000}s`);
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= 2; // exponential backoff
      } else {
        logger.error(`${label} failed after ${retries} attempts: ${msg}`);
        throw error;
      }
    }
  }
  throw new Error("unreachable");
}

// Start listening FIRST (so healthcheck passes), then run DB setup
(async () => {
  // Log masked DATABASE_URL for debugging
  const dbUrl = process.env.DATABASE_URL || "";
  logger.info("db host: " + (dbUrl.match(/@([^:\/]+)/)?.[1] || "unknown"));

  // Start HTTP server immediately so Railway healthcheck passes
  app.listen(PORT, "0.0.0.0", () => {
    logger.info("server started", { port: PORT, env: process.env.NODE_ENV || "development" });
  });

  // DB setup in background (non-blocking for healthcheck)
  try {
    await withRetry(() => ensureSchema(), "schema setup");
  } catch (_) {
    // already logged
  }

  try {
    await withRetry(() => seedAdminUser(), "seed admin");
  } catch (_) {
    // already logged
  }

  // Auto-import Excel data if AM tables are empty
  try {
    const existingScis = await db.select().from(scis).limit(1);
    if (existingScis.length === 0) {
      logger.info("AM tables empty — auto-importing Excel data...");
      const { importExcelData } = await import("./import-excel");
      const counts = await importExcelData();
      logger.info("Auto-import completed", counts);
    }
  } catch (err: any) {
    logger.warn("Auto-import Excel skipped: " + (err.message || err));
  }

  // Set default taux de capitalisation (6%) for actifs where it's null
  try {
    const result = await db.update(actifs)
      .set({ tauxCapitalisation: "6" })
      .where(isNull(actifs.tauxCapitalisation));
    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Set default taux_capitalisation=6% on ${result.rowCount} actifs`);
    }
  } catch (err: any) {
    logger.warn("Default taux_capitalisation update skipped: " + (err.message || err));
  }

  // Start automatic market data sync (DVF + ANIL + taux capi)
  startAutoSync();
})();

export default app;
