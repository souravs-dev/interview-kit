import { describe, expect, it } from "vitest";
import type { Question, Requirement } from "@interview-prep-kit/shared";
import { allocateSchedule } from "../scheduleAllocator.js";

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

function assertScheduleInvariants(schedule: ReturnType<typeof allocateSchedule>, allQuestions: Question[], daysAvailable: number) {
  expect(schedule.days_available).toBe(daysAvailable);
  expect(schedule.days.length).toBe(daysAvailable);
  for (const day of schedule.days) {
    expect(Number.isInteger(day.minutes)).toBe(true);
    expect(day.focus.length).toBeGreaterThan(0);
    expect(Number.isInteger(day.day)).toBe(true);
  }
  // Never drops a question: every input question id appears exactly once.
  const scheduledIds = schedule.days.flatMap((d) => d.question_ids);
  expect(scheduledIds.sort()).toEqual(allQuestions.map((q) => q.id).sort());
}

describe("allocateSchedule", () => {
  it("AC-006: a 1-day schedule compresses every question into that single day", () => {
    const questions = [
      question({ id: "q1", requirement_ids: ["r1"], difficulty: 2 }),
      question({ id: "q2", requirement_ids: ["r2"], difficulty: 1 }),
      question({ id: "q3", requirement_ids: ["r3"], difficulty: 3 }),
    ];
    const schedule = allocateSchedule(questions, requirements, 1);
    assertScheduleInvariants(schedule, questions, 1);
    expect(schedule.days[0]!.question_ids.sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("AC-007: a 60-day schedule spans exactly 60 days, not silently capped", () => {
    const questions = [
      question({ id: "q1", requirement_ids: ["r1"], difficulty: 2 }),
      question({ id: "q2", requirement_ids: ["r2"], difficulty: 1 }),
    ];
    const schedule = allocateSchedule(questions, requirements, 60);
    assertScheduleInvariants(schedule, questions, 60);
    // With only 2 questions and 60 days, the remaining 58 days must still
    // be present with a non-empty focus and integer minutes (review days).
    const emptyDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(emptyDays.length).toBe(58);
  });

  it("AC-008: every must-have requirement's covering question appears somewhere in the schedule", () => {
    const questions = [
      question({ id: "q1", requirement_ids: ["r1"], difficulty: 2 }),
      question({ id: "q2", requirement_ids: ["r2"], difficulty: 1 }),
      question({ id: "q3", requirement_ids: ["r3"], difficulty: 3 }),
    ];
    const schedule = allocateSchedule(questions, requirements, 5);
    const scheduledQuestionIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    const scheduledRequirementIds = new Set(
      questions.filter((q) => scheduledQuestionIds.has(q.id)).flatMap((q) => q.requirement_ids),
    );
    const mustHaveIds = requirements.filter((r) => r.priority === "must").map((r) => r.id);
    for (const id of mustHaveIds) {
      expect(scheduledRequirementIds.has(id)).toBe(true);
    }
  });

  it("AC-009: a must-have-covering question is scheduled no later than a nice-to-have-only question of equal difficulty", () => {
    const mustQuestion = question({ id: "q-must", requirement_ids: ["r1"], difficulty: 2 });
    const niceQuestion = question({ id: "q-nice", requirement_ids: ["r3"], difficulty: 2 });
    const schedule = allocateSchedule([niceQuestion, mustQuestion], requirements, 2);
    const dayOf = (qid: string) => schedule.days.find((d) => d.question_ids.includes(qid))!.day;
    expect(dayOf("q-must")).toBeLessThanOrEqual(dayOf("q-nice"));
  });

  it("harder material within the same priority tier lands on an earlier or equal day", () => {
    const harder = question({ id: "q-hard", requirement_ids: ["r1"], difficulty: 3 });
    const easier = question({ id: "q-easy", requirement_ids: ["r1"], difficulty: 1 });
    const schedule = allocateSchedule([easier, harder], requirements, 2);
    const dayOf = (qid: string) => schedule.days.find((d) => d.question_ids.includes(qid))!.day;
    expect(dayOf("q-hard")).toBeLessThanOrEqual(dayOf("q-easy"));
  });

  it("distributes more questions than days into contiguous priority-ordered chunks", () => {
    const questions = Array.from({ length: 7 }, (_, i) =>
      question({ id: `q${i + 1}`, requirement_ids: ["r1"], difficulty: ((i % 3) + 1) as 1 | 2 | 3 }),
    );
    const schedule = allocateSchedule(questions, requirements, 3);
    assertScheduleInvariants(schedule, questions, 3);
    // 7 questions / 3 days -> sizes 3, 2, 2 (remainder front-loaded)
    expect(schedule.days.map((d) => d.question_ids.length)).toEqual([3, 2, 2]);
  });

  it("handles zero questions by producing daysAvailable review days", () => {
    const schedule = allocateSchedule([], requirements, 3);
    assertScheduleInvariants(schedule, [], 3);
    expect(schedule.days.every((d) => d.question_ids.length === 0)).toBe(true);
  });

  it("is deterministic: same input produces the same schedule every time", () => {
    const questions = [
      question({ id: "q1", requirement_ids: ["r1"], difficulty: 2 }),
      question({ id: "q2", requirement_ids: ["r2"], difficulty: 1 }),
      question({ id: "q3", requirement_ids: ["r3"], difficulty: 3 }),
    ];
    const a = allocateSchedule(questions, requirements, 3);
    const b = allocateSchedule(questions, requirements, 3);
    expect(a).toEqual(b);
  });

  it("rejects a non-positive or non-integer daysAvailable", () => {
    expect(() => allocateSchedule([], requirements, 0)).toThrow();
    expect(() => allocateSchedule([], requirements, -1)).toThrow();
    expect(() => allocateSchedule([], requirements, 1.5)).toThrow();
  });
});
