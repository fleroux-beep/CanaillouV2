/**
 * Database backup utility — pg_dump based.
 * Runs on-demand or on a daily cron (5:30 AM Paris).
 * Retains the last 7 daily backups.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const MAX_BACKUPS = 7;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/** Run pg_dump | gzip with no shell — safe against DATABASE_URL injection. */
function runPgDumpToGzip(dbUrl: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    const dump = spawn("pg_dump", [dbUrl], { stdio: ["ignore", "pipe", "pipe"] });
    const gzip = spawn("gzip", [], { stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    dump.stderr.on("data", (d) => { stderr += d.toString(); });
    gzip.stderr.on("data", (d) => { stderr += d.toString(); });

    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);

    const timeout = setTimeout(() => {
      dump.kill("SIGKILL");
      gzip.kill("SIGKILL");
      reject(new Error("backup timeout (120s)"));
    }, 120_000);

    let pending = 2;
    const done = (code: number, who: string) => {
      if (code !== 0) {
        clearTimeout(timeout);
        return reject(new Error(`${who} exited with code ${code}: ${stderr}`));
      }
      pending--;
      if (pending === 0) {
        clearTimeout(timeout);
        out.end(() => resolve());
      }
    };
    dump.on("close", (code) => done(code ?? 0, "pg_dump"));
    gzip.on("close", (code) => done(code ?? 0, "gzip"));
    dump.on("error", (e) => { clearTimeout(timeout); reject(e); });
    gzip.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

export async function runBackup(): Promise<{ file: string; sizeKB: number } | { error: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { error: "DATABASE_URL not set" };

  ensureBackupDir();

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `canaillou-${stamp}.sql.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);

  try {
    await runPgDumpToGzip(dbUrl, filePath);

    const stats = fs.statSync(filePath);
    const sizeKB = Math.round(stats.size / 1024);
    logger.info(`backup: ${fileName} created (${sizeKB} KB)`);

    pruneOldBackups();
    return { file: fileName, sizeKB };
  } catch (err: any) {
    logger.error("backup failed", { error: err.message });
    try { fs.unlinkSync(filePath); } catch { /* file may not exist */ }
    return { error: err.message };
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("canaillou-") && f.endsWith(".sql.gz"))
      .sort()
      .reverse();

    for (const f of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      logger.info(`backup: pruned old backup ${f}`);
    }
  } catch (err: any) {
    logger.warn("backup prune error", { error: err.message });
  }
}

export function listBackups(): Array<{ file: string; sizeKB: number; date: string }> {
  ensureBackupDir();
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("canaillou-") && f.endsWith(".sql.gz"))
      .sort()
      .reverse()
      .map((f) => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, sizeKB: Math.round(stats.size / 1024), date: stats.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

/** Compute ms until the next 5:30 AM Europe/Paris, regardless of server timezone. */
function msUntilNext530Paris(): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const parisHour = parseInt(parts.hour, 10);
  const parisMinute = parseInt(parts.minute, 10);
  const parisSecond = parseInt(parts.second, 10);

  // Minutes since Paris midnight
  const parisMinutesNow = parisHour * 60 + parisMinute + parisSecond / 60;
  const target = 5 * 60 + 30; // 5:30 AM
  let deltaMin = target - parisMinutesNow;
  if (deltaMin <= 0) deltaMin += 24 * 60;
  return Math.round(deltaMin * 60_000);
}

export function scheduleDaily() {
  function tick() {
    runBackup();
    setTimeout(tick, msUntilNext530Paris());
  }

  setTimeout(tick, msUntilNext530Paris());
  logger.info("backup: daily schedule activated (5:30 AM Europe/Paris)");
}
