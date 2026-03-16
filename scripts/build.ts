import { execSync } from "child_process";
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
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  external: [
    "pg-native",
    "bcrypt",
    "better-sqlite3",
    "vite",
    "lightningcss",
  ],
  sourcemap: true,
});

console.log("Build complete!");
