/**
 * Database backup utility — pg_dump based.
 * Runs on-demand or on a daily cron (5:30 AM Paris).
 * Retains the last 7 daily backups.
 */
import { execSync } from "child_process";
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

export function runBackup(): { file: string; sizeKB: number } | { error: string } {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { error: "DATABASE_URL not set" };

  ensureBackupDir();

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `canaillou-${stamp}.sql.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);

  try {
    execSync(`pg_dump "${dbUrl}" | gzip > "${filePath}"`, {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stats = fs.statSync(filePath);
    const sizeKB = Math.round(stats.size / 1024);
    logger.info(`backup: ${fileName} created (${sizeKB} KB)`);

    pruneOldBackups();
    return { file: fileName, sizeKB };
  } catch (err: any) {
    logger.error("backup failed", { error: err.message });
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

export function scheduleDaily() {
  function msUntilNext530() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(5, 30, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  function tick() {
    runBackup();
    setTimeout(tick, msUntilNext530());
  }

  setTimeout(tick, msUntilNext530());
  logger.info("backup: daily schedule activated (5:30 AM)");
}
