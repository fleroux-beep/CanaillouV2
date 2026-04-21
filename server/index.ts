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
import { registerImportWizardRoutes } from "./routes/import-wizard";
import { logger, requestLogger } from "./lib/logger";
import { requireAdmin } from "./middleware/auth";
import { startAutoSync, stopAutoSync } from "./lib/auto-sync-marche";
import helmet from "helmet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Security headers — enable CSP in production
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
    },
  } : false,
}));
const PORT = Number(process.env.PORT) || 5000;

// Logging
app.use(requestLogger);

// CORS — allow same-origin + localhost in dev only
app.use((_req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    const origin = _req.headers.origin;
    if (origin) {
      try {
        const { hostname } = new URL(origin);
        if (hostname === "localhost" || hostname === "127.0.0.1") {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Access-Control-Allow-Credentials", "true");
          res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
          res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
        }
      } catch {
        // Invalid origin URL — ignore
      }
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
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    logger.error("SESSION_SECRET manquant en production — arrêt immédiat");
    throw new Error("SESSION_SECRET est requis en production");
  }
  logger.warn("SESSION_SECRET manquant en dev — secret aléatoire généré (sessions invalidées au redémarrage)");
}
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  `dev-secret-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
const PgStore = ConnectPgSimple(session);
app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    },
  })
);

// CSRF protection — require custom header on state-changing requests
// Browsers won't add custom headers in cross-origin form submissions
app.use((req: any, res: any, next: any) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // Skip for health check and static assets
  if (!req.path.startsWith("/api/")) return next();
  const xrw = req.headers["x-requested-with"];
  if (xrw === "XMLHttpRequest" || xrw === "fetch") return next();
  // Also accept Content-Type: application/json as evidence of programmatic request
  const ct = req.headers["content-type"] || "";
  if (ct.includes("application/json")) return next();
  // Accept multipart/form-data for file uploads (requires session cookie for auth)
  if (ct.includes("multipart/form-data")) return next();
  return res.status(403).json({ error: "Requête refusée (CSRF)" });
});

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
registerImportWizardRoutes(app);

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

// Health check with DB ping
app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    // DB not reachable
  }
  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    db: dbOk ? "connected" : "unreachable",
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
  logger.error("unhandled error", {
    error: err.message,
    url: _req.originalUrl,
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
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

let server: ReturnType<typeof app.listen> | undefined;

// Start listening FIRST (so healthcheck passes), then run DB setup
(async () => {
  // Log masked DATABASE_URL for debugging
  const dbUrl = process.env.DATABASE_URL || "";
  logger.info("db host: " + (dbUrl.match(/@([^:\/]+)/)?.[1] || "unknown"));

  // Start HTTP server immediately so Railway healthcheck passes
  server = app.listen(PORT, "0.0.0.0", () => {
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

  // Start automatic market data sync (DVF + ANIL + taux capi)
  startAutoSync();
})();

// ─── Graceful shutdown ─────────────────────────────────────
function gracefulShutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  stopAutoSync();
  server?.close(() => {
    pool.end().then(() => {
      logger.info("Database pool closed");
      process.exit(0);
    }).catch(() => process.exit(1));
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { error: String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { error: err.message, stack: err.stack });
  process.exit(1);
});

export default app;
