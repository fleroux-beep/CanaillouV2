import express from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { pool, db } from "./db";
import { ensureSchema } from "./ensure-schema";
import { users } from "@shared/schema";
import { registerAuthRoutes } from "./routes/auth";
import { registerAMRoutes } from "./routes/am";
import { registerGLRoutes } from "./routes/gl";
import { registerImportRoutes } from "./routes/import";
import { logger, requestLogger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
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
registerGLRoutes(app);
registerImportRoutes(app);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Debug: check database tables (temporary — remove once resolved)
app.get("/api/debug/tables", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = result.rows.map((r: any) => r.table_name);

    // Also try a simple query on the main GL tables
    const checks: Record<string, string> = {};
    for (const t of ["gl_baux", "gl_bailleurs", "gl_paiements", "gl_locataires", "am_scis", "am_actifs", "am_lots", "users", "sessions"]) {
      try {
        const r = await pool.query(`SELECT count(*) as cnt FROM "${t}"`);
        checks[t] = `ok (${r.rows[0].cnt} rows)`;
      } catch (e: any) {
        checks[t] = `ERROR: ${e.message}`;
      }
    }

    // Try Drizzle ORM queries (same as dashboard)
    const { bauxGL, bailleurs, paiementsGL } = await import("@shared/schema");
    const { isNull, desc } = await import("drizzle-orm");
    const drizzleChecks: Record<string, string> = {};
    const tableMap: Record<string, any> = { gl_baux: bauxGL, gl_bailleurs: bailleurs, gl_paiements: paiementsGL };
    for (const [name, table] of Object.entries(tableMap)) {
      try {
        const hasDeletedAt = "deletedAt" in table;
        const rows = hasDeletedAt
          ? await db.select().from(table).where(isNull(table.deletedAt)).orderBy(desc(table.createdAt))
          : await db.select().from(table).orderBy(desc(table.createdAt));
        drizzleChecks[name] = `ok (${rows.length} rows)`;
      } catch (e: any) {
        drizzleChecks[name] = `ERROR: ${e.message}`;
      }
    }

    res.json({ tables, checks, drizzleChecks, sessionConfig: { secure: process.env.NODE_ENV === "production" } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
  logger.error("unhandled error", { error: err.message, stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

// Seed default admin user if none exists (throws on failure for retry logic)
async function seedAdminUser() {
  const existing = await db.select().from(users).where(eq(users.email, "fleroux@lespetitescanailles.fr")).limit(1);
  if (existing.length === 0) {
    const hashed = await bcrypt.hash("LPC040411", 10);
    await db.insert(users).values({
      email: "fleroux@lespetitescanailles.fr",
      password: hashed,
      firstName: "Fleroux",
      role: "admin",
      isApproved: true,
    });
    logger.info("admin user created");
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

// Run schema setup, seed, then start listening
(async () => {
  // Log masked DATABASE_URL for debugging
  const dbUrl = process.env.DATABASE_URL || "";
  logger.info("db host: " + (dbUrl.match(/@([^:\/]+)/)?.[1] || "unknown"));

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

  app.listen(PORT, "0.0.0.0", () => {
    logger.info("server started", { port: PORT, env: process.env.NODE_ENV || "development" });
  });
})();

export default app;
