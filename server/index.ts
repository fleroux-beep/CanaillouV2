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

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Session
const PgStore = ConnectPgSimple(session);
app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
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

app.listen(PORT, "0.0.0.0", () => {
  logger.info("server started", { port: PORT, env: process.env.NODE_ENV || "development" });
});

export default app;
