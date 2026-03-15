import express from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db";
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

// In production, serve the built frontend
if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
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

app.listen(PORT, "0.0.0.0", () => {
  logger.info("server started", { port: PORT, env: process.env.NODE_ENV || "development" });
});

export default app;
