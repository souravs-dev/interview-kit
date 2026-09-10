import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "../rateLimit.js";

function fakeReqRes(ip: string) {
  const req = { ip } as never;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as never;
  return { req, res, status, json };
}

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const next = vi.fn();
    for (let i = 0; i < 3; i++) {
      const { req, res } = fakeReqRes("1.2.3.4");
      limiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks requests once the limit is exceeded, with a 429", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();
    for (let i = 0; i < 2; i++) {
      const { req, res } = fakeReqRes("1.2.3.4");
      limiter(req, res, next);
    }
    const { req, res, status } = fakeReqRes("1.2.3.4");
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2); // third call did not reach next()
    expect(status).toHaveBeenCalledWith(429);
  });

  it("tracks limits independently per IP", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const next = vi.fn();
    const a = fakeReqRes("1.1.1.1");
    limiter(a.req, a.res, next);
    const b = fakeReqRes("2.2.2.2");
    limiter(b.req, b.res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("resets the count after the window elapses", () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
      const next = vi.fn();
      const first = fakeReqRes("1.2.3.4");
      limiter(first.req, first.res, next);
      vi.advanceTimersByTime(1001);
      const second = fakeReqRes("1.2.3.4");
      limiter(second.req, second.res, next);
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
