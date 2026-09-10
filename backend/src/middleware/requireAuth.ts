import type { NextFunction, Request, Response } from "express";
import { getSessionUserId } from "../auth/sessions.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Rejects any request without a valid, unexpired session — signed-out
 * visitors can't reach protected pages/endpoints (Section 1). Session
 * validity is re-checked on every request (not cached), so an expired or
 * revoked session is rejected immediately, not just after a TTL sweep.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.session as string | undefined;
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not signed in" } });
    return;
  }
  const userId = await getSessionUserId(token);
  if (!userId) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session expired or invalid" } });
    return;
  }
  req.userId = userId;
  next();
}
