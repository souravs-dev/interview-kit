import { Router, type Response } from "express";
import { z } from "zod";
import { User } from "../db/models/User.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { createSession, deleteSession } from "../auth/sessions.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const RegisterBody = z.object({ email: z.string().email(), password: z.string().min(8) });
const LoginBody = z.object({ email: z.string().email(), password: z.string() });

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    expires: expiresAt,
  });
}

/**
 * Factory, not a module-level singleton — the rate limiter's bucket state
 * needs to live on the app instance, not the module (a module-level
 * limiter would leak state across every app built in the same process,
 * which is invisible in production, one app per process, but breaks test
 * isolation, where many app instances share one process).
 */
export function createAuthRouter(): Router {
  const router: Router = Router();
  const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  router.post("/register", authRateLimiter, async (req, res, next) => {
    try {
      const parsed = RegisterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues.map((i) => i.message).join("; ") } });
        return;
      }
      const { email, password } = parsed.data;
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with that email already exists" } });
        return;
      }
      const passwordHash = await hashPassword(password);
      const user = await User.create({ email, passwordHash });
      const { token, expiresAt } = await createSession(String(user._id));
      setSessionCookie(res, token, expiresAt);
      res.status(201).json({ user: { id: String(user._id), email: user.email } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", authRateLimiter, async (req, res, next) => {
    try {
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid request" } });
        return;
      }
      const { email, password } = parsed.data;
      // Generic failure message regardless of which check fails — avoids
      // leaking which emails have accounts (user enumeration, Section 7).
      const invalidCredentials = () => res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        invalidCredentials();
        return;
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        invalidCredentials();
        return;
      }
      const { token, expiresAt } = await createSession(String(user._id));
      setSessionCookie(res, token, expiresAt);
      res.json({ user: { id: String(user._id), email: user.email } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      const token = req.cookies?.session as string | undefined;
      if (token) await deleteSession(token);
      res.clearCookie("session");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/session", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const user = await User.findById(req.userId).select("email");
      if (!user) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session refers to a deleted user" } });
        return;
      }
      res.json({ user: { id: String(user._id), email: user.email } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
