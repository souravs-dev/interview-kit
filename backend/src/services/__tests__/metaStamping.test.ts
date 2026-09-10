import { describe, expect, it } from "vitest";
import { stampGeneratedMeta } from "../metaStamping.js";
import { buildValidKitFixture } from "@interview-prep-kit/shared";

describe("stampGeneratedMeta", () => {
  it("stamps every question and flashcard with generated/unpinned _meta", () => {
    const kit = buildValidKitFixture();
    const stamped = stampGeneratedMeta(kit, "job-1");
    for (const q of stamped.questions) {
      expect(q._meta).toMatchObject({ source: "generated", pinned: false, generationBatch: "job-1" });
    }
    for (const f of stamped.flashcards) {
      expect(f._meta).toMatchObject({ source: "generated", pinned: false, generationBatch: "job-1" });
    }
  });

  it("stamps company_brief and schedule too", () => {
    const kit = buildValidKitFixture();
    const stamped = stampGeneratedMeta(kit, "job-1");
    expect(stamped.company_brief._meta).toMatchObject({ source: "generated" });
    expect(stamped.schedule._meta).toMatchObject({ source: "generated" });
  });

  it("assigns increasing order values matching array position", () => {
    const kit = buildValidKitFixture();
    const stamped = stampGeneratedMeta(kit, "job-1");
    const orders = stamped.questions.map((q) => q._meta!.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length); // no duplicates
  });

  it("does not mutate the input kit", () => {
    const kit = buildValidKitFixture();
    const before = JSON.stringify(kit);
    stampGeneratedMeta(kit, "job-1");
    expect(JSON.stringify(kit)).toBe(before);
  });
});
