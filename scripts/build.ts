import { execSync } from "child_process";
import esbuild from "esbuild";

// Push database schema
console.log("Pushing database schema...");
try {
  execSync("npx drizzle-kit push", { stdio: "inherit", cwd: process.cwd() });
} catch (e) {
  console.error("Warning: db:push failed, tables may already exist or DATABASE_URL not set");
}

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
    "lightningcss",
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

console.log("Build complete!");
