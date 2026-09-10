import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense (RFC-001 section 10 decision): the session cookie is
 * SameSite=None (required since frontend/backend are cross-origin), so
 * this Origin/Referer check is what actually stops a cross-site request
 * from riding an authenticated user's cookie on a state-changing request.
 */
export function csrfOriginCheck(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const source = req.headers.origin ?? req.headers.referer;
    if (!source || !source.startsWith(allowedOrigin)) {
      res.status(403).json({ error: { code: "CSRF_CHECK_FAILED", message: "Origin/Referer header missing or mismatched" } });
      return;
    }
    next();
  };
}
