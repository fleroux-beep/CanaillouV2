import { execSync } from "child_process";
import esbuild from "esbuild";

// Build frontend with Vite
console.log("Building frontend...");
execSync("npx vite build", { stdio: "inherit", cwd: process.cwd() });

// Build backend with esbuild
console.log("Building backend...");
await esbuild.build({
  entryPoints: ["server/index.ts"],
  outfile: "dist/index.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["pg-native"],
  sourcemap: true,
});

console.log("Build complete!");
