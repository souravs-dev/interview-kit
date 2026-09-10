import { describe, expect, it } from "vitest";
import { validateKit } from "../kit.js";
import { buildValidKitFixture } from "../../testing/fixtures.js";

describe("validateKit", () => {
  it("accepts a structurally valid kit", () => {
    const result = validateKit(buildValidKitFixture());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a kit missing a required Appendix A field", () => {
    const kit = buildValidKitFixture();
    const { source: _source, ...withoutSource } = kit as any;
    const result = validateKit(withoutSource);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a schedule.days entry referencing a question that does not exist", () => {
    const kit = buildValidKitFixture();
    kit.schedule.days[0]!.question_ids = ["q-does-not-exist"];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DANGLING_QUESTION_ID")).toBe(true);
  });

  it("rejects a question referencing a requirement id that does not exist", () => {
    const kit = buildValidKitFixture();
    kit.questions[0]!.requirement_ids = ["r-does-not-exist"];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DANGLING_REQUIREMENT_ID")).toBe(true);
  });

  it("rejects duplicate question ids within a kit", () => {
    const kit = buildValidKitFixture();
    kit.questions.push({ ...kit.questions[0]! });
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
  });

  it("rejects a schedule whose days.length does not match days_available", () => {
    const kit = buildValidKitFixture();
    kit.schedule.days_available = 5;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SCHEDULE_DAY_COUNT_MISMATCH")).toBe(true);
  });

  it("rejects a difficulty value outside 1-3", () => {
    const kit = buildValidKitFixture();
    (kit.questions[0] as any).difficulty = 4;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });

  it("rejects non-integer minutes", () => {
    const kit = buildValidKitFixture();
    (kit.schedule.days[0] as any).minutes = 60.5;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });

  it("rejects coverage.uncovered_requirement_ids referencing an unknown requirement", () => {
    const kit = buildValidKitFixture();
    kit.coverage.uncovered_requirement_ids = ["r-nonexistent"];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DANGLING_REQUIREMENT_ID")).toBe(true);
  });

  it("accepts a kit extended with _meta blocks (extension is permitted)", () => {
    const kit = buildValidKitFixture();
    (kit.questions[0] as any)._meta = {
      source: "edited",
      pinned: false,
      order: 1000,
      generatedAt: null,
      editedAt: "2026-09-05T00:00:00Z",
      generationBatch: null,
    };
    const result = validateKit(kit);
    expect(result.valid).toBe(true);
  });
});
