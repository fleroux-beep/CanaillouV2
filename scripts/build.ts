import { execSync } from "child_process";
import { copyFileSync, existsSync, readdirSync } from "fs";
import esbuild from "esbuild";

// Build frontend with Vite
console.log("Building frontend...");
execSync("npx vite build", { stdio: "inherit", cwd: process.cwd() });

// Build backend with esbuild
console.log("Building backend...");
await esbuild.build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: {
    js: "import{createRequire}from'module';import{fileURLToPath as __file}from'url';import{dirname as __dir}from'path';const require=createRequire(import.meta.url);const __filename=__file(import.meta.url);const __dirname=__dir(__filename);",
  },
  external: [
    "pg-native",
    "bcrypt",
    "better-sqlite3",
    "lightningcss",
    "xlsx",
    "playwright-core",
    "playwright",
    "chromium-bidi",
  ],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      // Replace vite-dev.ts with a stub so "vite" (devDependency) is never imported
      name: "exclude-vite-dev",
      setup(build) {
        build.onResolve({ filter: /vite-dev/ }, () => ({
          path: "vite-dev",
          namespace: "exclude",
        }));
        build.onLoad({ filter: /.*/, namespace: "exclude" }, () => ({
          contents: "export function setupViteDevServer() {}",
        }));
      },
    },
  ],
  sourcemap: true,
});

// Copy Excel data files for import (handle NFD/NFC unicode in filenames)
const xlsxFiles = [
  "BDD_SCI_restructuree.xlsx",
  "BDD SCI 07.04.26 - BDD - loyers actuels complétés.xlsx",
];
for (const target of xlsxFiles) {
  const match = readdirSync(".").find((f) => f.normalize("NFC") === target.normalize("NFC"));
  if (match) {
    copyFileSync(match, `dist/${match}`);
    console.log(`Copied Excel: ${match} → dist/`);
  }
}

console.log("Build complete!");
