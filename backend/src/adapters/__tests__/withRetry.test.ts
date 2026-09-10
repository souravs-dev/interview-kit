import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../withRetry.js";

const noopSleep = async () => {};

describe("withRetry", () => {
  it("returns the result on the first successful attempt without sleeping", async () => {
    const sleep = vi.fn(noopSleep);
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on failure and succeeds within maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { maxAttempts: 3, sleep: noopSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error once maxAttempts is exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { maxAttempts: 3, sleep: noopSleep })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when isRetryable returns false, without exhausting attempts", async () => {
    const fatal = new Error("fatal, do not retry");
    const fn = vi.fn().mockRejectedValue(fatal);
    await expect(withRetry(fn, { maxAttempts: 5, isRetryable: () => false, sleep: noopSleep })).rejects.toThrow(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies exponential backoff delays between attempts", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, factor: 2, jitter: false, sleep });
    expect(delays).toEqual([100, 200]);
  });
});
