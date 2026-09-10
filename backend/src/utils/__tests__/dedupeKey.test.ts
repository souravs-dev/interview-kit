import { describe, expect, it } from "vitest";
import { computeDedupeKey } from "../dedupeKey.js";

describe("computeDedupeKey", () => {
  it("produces the same key for identical inputs", () => {
    const a = computeDedupeKey("Senior Engineer", "https://acme.com/");
    const b = computeDedupeKey("Senior Engineer", "https://acme.com/");
    expect(a).toBe(b);
  });

  it("is case-insensitive", () => {
    const a = computeDedupeKey("Senior Engineer", "https://ACME.com/");
    const b = computeDedupeKey("senior engineer", "https://acme.com/");
    expect(a).toBe(b);
  });

  it("is insensitive to leading/trailing whitespace and internal whitespace runs", () => {
    const a = computeDedupeKey("  Senior   Engineer  ", "https://acme.com/");
    const b = computeDedupeKey("Senior Engineer", "https://acme.com/");
    expect(a).toBe(b);
  });

  it("produces different keys for different JDs", () => {
    const a = computeDedupeKey("Senior Engineer", "https://acme.com/");
    const b = computeDedupeKey("Junior Engineer", "https://acme.com/");
    expect(a).not.toBe(b);
  });

  it("produces different keys for different company URLs", () => {
    const a = computeDedupeKey("Senior Engineer", "https://acme.com/");
    const b = computeDedupeKey("Senior Engineer", "https://other.com/");
    expect(a).not.toBe(b);
  });
});
