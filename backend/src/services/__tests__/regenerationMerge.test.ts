import { describe, expect, it } from "vitest";
import { makeIdAllocator, nextOrderAfter, partitionForRegeneration } from "../regenerationMerge.js";
import type { ItemMeta } from "@interview-prep-kit/shared";

function meta(overrides: Partial<ItemMeta> = {}): ItemMeta {
  return { source: "generated", pinned: false, order: 1000, generatedAt: null, editedAt: null, generationBatch: null, ...overrides };
}

describe("partitionForRegeneration", () => {
  it("discards a plain, unpinned, machine-generated item", () => {
    const items = [{ id: "q1", _meta: meta({ source: "generated", pinned: false }) }];
    const { keep, discard } = partitionForRegeneration(items);
    expect(keep).toEqual([]);
    expect(discard).toHaveLength(1);
  });

  it("keeps an edited item even though it started as generated", () => {
    const items = [{ id: "q1", _meta: meta({ source: "edited" }) }];
    const { keep, discard } = partitionForRegeneration(items);
    expect(keep).toHaveLength(1);
    expect(discard).toEqual([]);
  });

  it("keeps a user_added item", () => {
    const items = [{ id: "q1", _meta: meta({ source: "user_added" }) }];
    const { keep } = partitionForRegeneration(items);
    expect(keep).toHaveLength(1);
  });

  it("keeps a pinned item even though it's still machine-generated (AC-011)", () => {
    const items = [{ id: "q1", _meta: meta({ source: "generated", pinned: true }) }];
    const { keep, discard } = partitionForRegeneration(items);
    expect(keep).toHaveLength(1);
    expect(discard).toEqual([]);
  });

  it("treats an item with no _meta at all as protected (safer default)", () => {
    const items = [{ id: "q1" }];
    const { keep } = partitionForRegeneration(items);
    expect(keep).toHaveLength(1);
  });

  it("correctly partitions a mixed set (AC-010 scenario)", () => {
    const items = [
      { id: "q1", _meta: meta({ source: "edited" }) }, // keep
      { id: "q2", _meta: meta({ source: "generated", pinned: false }) }, // discard
      { id: "q3", _meta: meta({ source: "generated", pinned: true }) }, // keep
      { id: "q4", _meta: meta({ source: "user_added" }) }, // keep
    ];
    const { keep, discard } = partitionForRegeneration(items);
    expect(keep.map((i) => i.id).sort()).toEqual(["q1", "q3", "q4"]);
    expect(discard.map((i) => i.id)).toEqual(["q2"]);
  });
});

describe("makeIdAllocator", () => {
  it("continues numbering from the highest existing id", () => {
    const next = makeIdAllocator(["q1", "q2", "q5"], "q");
    expect(next()).toBe("q6");
    expect(next()).toBe("q7");
  });

  it("starts at 1 when there are no existing ids with the prefix", () => {
    const next = makeIdAllocator([], "q");
    expect(next()).toBe("q1");
  });

  it("ignores ids with a different prefix", () => {
    const next = makeIdAllocator(["f1", "f2"], "q");
    expect(next()).toBe("q1");
  });

  it("never produces a collision with an existing id", () => {
    const existing = ["q1", "q2", "q3"];
    const next = makeIdAllocator(existing, "q");
    const generated = [next(), next()];
    for (const id of generated) {
      expect(existing).not.toContain(id);
    }
  });
});

describe("nextOrderAfter", () => {
  it("returns 1000 for an empty list", () => {
    expect(nextOrderAfter([])).toBe(1000);
  });

  it("continues after the highest existing order", () => {
    const items = [{ _meta: meta({ order: 1000 }) }, { _meta: meta({ order: 3000 }) }];
    expect(nextOrderAfter(items)).toBe(4000);
  });

  it("treats a missing _meta as order 0", () => {
    expect(nextOrderAfter([{}])).toBe(1000);
  });
});
