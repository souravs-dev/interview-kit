import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-process sliding-window rate limiter — no Redis, matching the
 * RFC's "no BullMQ/Redis" simplicity decision for a single-instance
 * free-tier deploy. Blunts brute-force/credential-stuffing on auth
 * endpoints and cost-abuse on generation endpoints (Section 7).
 */
export function createRateLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests — try again later" } });
      return;
    }
    next();
  };
}
