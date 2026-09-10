import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../mapWithConcurrency.js";

describe("mapWithConcurrency", () => {
  it("processes every item and preserves result order regardless of completion order", async () => {
    const items = [50, 10, 30, 5, 20];
    const results = await mapWithConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 2;
    });
    expect(results).toEqual([100, 20, 60, 10, 40]);
  });

  it("never runs more than `concurrency` tasks at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("handles an empty items array", async () => {
    const results = await mapWithConcurrency([], 3, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("handles concurrency greater than item count", async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (n) => n * 10);
    expect(results).toEqual([10, 20]);
  });

  it("propagates a rejection from any task", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
