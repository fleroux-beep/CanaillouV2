import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({
      error: "Non authentifié",
      debug: {
        hasSession: !!req.session,
        sessionID: req.sessionID?.substring(0, 8) + "...",
        hasCookie: !!req.headers.cookie,
        cookieHeader: req.headers.cookie?.substring(0, 80),
        secure: req.secure,
        proto: req.headers["x-forwarded-proto"],
        sessionKeys: req.session ? Object.keys(req.session) : [],
      },
    });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }
  next();
}

/**
 * Restrict write operations (POST/PATCH/DELETE) to admin users.
 * Read operations (GET) are allowed for all authenticated users.
 */
export function requireWriteAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && req.session.role !== "admin") {
    return res.status(403).json({ error: "Modification réservée aux administrateurs" });
  }
  next();
}

// Extend Express session type
declare module "express-session" {
  interface SessionData {
    userId: string;
    email: string;
    role: string;
  }
}
