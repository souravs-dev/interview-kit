import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Central error handler — returns useful structured messages to the
 * interface (Section 13) without ever leaking a stack trace or internal
 * detail to the CLIENT for an unclassified (500) error.
 *
 * Server-side logging is deliberately narrow: some internal errors (e.g.
 * LlmJsonError) carry extra own-properties derived from untrusted input
 * (a raw LLM response, itself derived from crawled page content or the
 * pasted JD) — Node's console.error would print those extra properties
 * alongside the stack if given the whole error object. Logging only
 * `.stack` (name + message + trace, computed by V8, no custom fields)
 * gives the same debugging value without that leak (Section 7: never
 * log full JD/page text).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err instanceof Error ? err.stack : err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
