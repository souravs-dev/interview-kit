import { describe, expect, it } from "vitest";
import type { Question, Requirement } from "@interview-prep-kit/shared";
import { checkCoverage } from "../coverageChecker.js";

const requirements: Requirement[] = [
  { id: "r1", text: "5+ years Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring juniors", kind: "behavioural", priority: "must" },
  { id: "r3", text: "GraphQL familiarity", kind: "technical", priority: "nice" },
];

function question(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    requirement_ids: [],
    category: "technical",
    prompt: "prompt",
    answer_outline: "outline",
    difficulty: 1,
    ...overrides,
  };
}

describe("checkCoverage", () => {
  it("returns no gaps when every requirement is covered", () => {
    const questions = [
      question({ id: "q1", requirement_ids: ["r1"] }),
      question({ id: "q2", requirement_ids: ["r2"] }),
      question({ id: "q3", requirement_ids: ["r3"] }),
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.uncoveredMustHaveIds).toEqual([]);
  });

  it("reports a requirement with zero referencing questions as uncovered (AC-004 scenario)", () => {
    const questions = [question({ id: "q1", requirement_ids: ["r1"] }), question({ id: "q2", requirement_ids: ["r2"] })];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual(["r3"]);
  });

  it("separates must-have gaps from nice-to-have gaps", () => {
    // r1 (must) and r3 (nice) both uncovered; only r1 should surface as a must-have gap.
    const questions = [question({ id: "q2", requirement_ids: ["r2"] })];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds.sort()).toEqual(["r1", "r3"]);
    expect(result.uncoveredMustHaveIds).toEqual(["r1"]);
  });

  it("treats zero questions as every requirement uncovered", () => {
    const result = checkCoverage(requirements, []);
    expect(result.uncoveredRequirementIds.sort()).toEqual(["r1", "r2", "r3"]);
    expect(result.uncoveredMustHaveIds.sort()).toEqual(["r1", "r2"]);
  });

  it("returns no gaps when there are zero requirements", () => {
    const result = checkCoverage([], [question({ id: "q1", requirement_ids: ["r1"] })]);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.uncoveredMustHaveIds).toEqual([]);
  });

  it("a single question can cover multiple requirements", () => {
    const questions = [question({ id: "q1", requirement_ids: ["r1", "r2", "r3"] })];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual([]);
  });
});
