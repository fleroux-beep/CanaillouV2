import type { Express } from "express";
import bcrypt from "bcrypt";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { validate, loginSchema, changePasswordSchema, createUserSchema } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { logger } from "../lib/logger";

// 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit(10, 15 * 60 * 1000);

export function registerAuthRoutes(app: Express) {
  // Login
  app.post("/api/auth/login", loginLimiter, validate(loginSchema), async (req: any, res: any) => {
    try {
      const { email, password } = req.body;

      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = rows[0];
      if (!user) {
        return res.status(401).json({ error: "Identifiants invalides" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Identifiants invalides" });
      }

      if (!user.isApproved) {
        return res.status(403).json({ error: "Compte en attente d'approbation" });
      }

      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.role = user.role;

      // Wait for session to be persisted before responding
      try {
        await new Promise<void>((resolve, reject) => {
          req.session.save((err: any) => (err ? reject(err) : resolve()));
        });
        logger.info("session saved successfully", { sessionID: req.sessionID, userId: user.id });
      } catch (saveErr: any) {
        logger.error("SESSION SAVE FAILED", { error: saveErr.message, stack: saveErr.stack, sessionID: req.sessionID });
        return res.status(500).json({ error: "Erreur de sauvegarde de session", detail: saveErr.message });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: any, res: any) => {
    req.session.destroy((err: any) => {
      if (err) return res.status(500).json({ error: "Erreur lors de la déconnexion" });
      res.json({ ok: true });
    });
  });

  // Get current user
  app.get("/api/auth/user", requireAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
      res.json(user);
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Change password
  app.patch("/api/auth/password", requireAuth, validate(changePasswordSchema), async (req: any, res: any) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const pwRows = await db.select().from(users).where(eq(users.id, req.session.userId!)).limit(1);
      const user = pwRows[0];
      if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect" });

      const hashed = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, user.id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Admin: list users
  app.get("/api/users", requireAdmin, async (_req: any, res: any) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isApproved: users.isApproved,
          createdAt: users.createdAt,
        })
        .from(users);
      res.json(allUsers);
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Admin: create/invite user
  app.post("/api/users", requireAdmin, validate(createUserSchema), async (req: any, res: any) => {
    try {
      const { email, password, firstName, lastName, role } = req.body;
      const hashed = await bcrypt.hash(password, 10);
      const newRows = await db
        .insert(users)
        .values({
          email,
          password: hashed,
          firstName,
          lastName,
          role: role || "user",
          isApproved: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        });
      const newUser = newRows[0];
      res.status(201).json(newUser);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Cet email existe déjà" });
      }
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Admin: approve user
  app.patch("/api/users/:id/approve", requireAdmin, async (req: any, res: any) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await db.update(users).set({ isApproved: true }).where(eq(users.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Admin: delete user
  app.delete("/api/users/:id", requireAdmin, async (req: any, res: any) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await db.delete(users).where(eq(users.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      logger.error("auth error", { error: error.message });
      res.status(500).json({ error: "Erreur interne" });
    }
  });
}
