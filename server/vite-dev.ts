import type { Express } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupViteDevServer(app: Express) {
  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "../vite.config.ts"),
    root: path.resolve(__dirname, "../client"),
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);
}
