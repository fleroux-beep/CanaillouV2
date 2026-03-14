/**
 * Structured JSON logger — zero dependencies.
 * Outputs JSON lines for easy parsing by log aggregators.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LEVELS.info;

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};

/**
 * Express middleware for HTTP request logging.
 */
export function requestLogger(req: any, res: any, next: () => void) {
  const start = Date.now();
  const { method, url } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const lvl: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    logger[lvl]("request", {
      method,
      url,
      status,
      duration,
      userId: req.session?.userId,
    });
  });

  next();
}
