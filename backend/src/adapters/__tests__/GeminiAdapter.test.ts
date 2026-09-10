import { describe, expect, it } from "vitest";
import { extractGeminiRetryDelayMs } from "../GeminiAdapter.js";

describe("extractGeminiRetryDelayMs", () => {
  it("parses a retryDelay hint from a Gemini 429 error body", () => {
    const error = new Error(
      '{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"51s"}]}}',
    );
    expect(extractGeminiRetryDelayMs(error)).toBe(52_000); // +1s safety margin
  });

  it("parses a fractional-second retryDelay", () => {
    const error = new Error('{"retryDelay":"2.5s"}');
    expect(extractGeminiRetryDelayMs(error)).toBe(3_500);
  });

  it("caps an extreme retryDelay so a bad parse can't stall forever", () => {
    const error = new Error('{"retryDelay":"9999s"}');
    expect(extractGeminiRetryDelayMs(error)).toBe(65_000);
  });

  it("returns undefined when there is no retryDelay hint", () => {
    const error = new Error("some other failure");
    expect(extractGeminiRetryDelayMs(error)).toBeUndefined();
  });

  it("returns undefined for a non-Error value", () => {
    expect(extractGeminiRetryDelayMs("plain string")).toBeUndefined();
  });
});
