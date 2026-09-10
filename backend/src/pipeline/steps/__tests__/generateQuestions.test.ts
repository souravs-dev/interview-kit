import { describe, expect, it } from "vitest";
import type { Requirement } from "@interview-prep-kit/shared";
import { generateQuestionsForCategory } from "../generateQuestions.js";
import { FakeLlmAdapter } from "../../../adapters/fakes/FakeLlmAdapter.js";

const requirements: Requirement[] = [
  { id: "r1", text: "5+ years with React", kind: "technical", priority: "must" },
];

function makeCounter(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

describe("generateQuestionsForCategory", () => {
  it("returns an empty array without calling the LLM when there are no requirements", async () => {
    const llm = new FakeLlmAdapter();
    const result = await generateQuestionsForCategory([], "technical", "", { llm }, makeCounter("q"));
    expect(result).toEqual([]);
    expect(llm.callCount).toBe(0);
  });

  it("assigns ids via the shared counter and tags every question with the given category", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({
      questions: [{ requirement_ids: ["r1"], prompt: "Explain reconciliation.", answer_outline: "...", difficulty: 2 }],
    });
    const result = await generateQuestionsForCategory(requirements, "technical", "", { llm }, makeCounter("q"));
    expect(result).toEqual([
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain reconciliation.", answer_outline: "...", difficulty: 2 },
    ]);
  });

  it("uses a different category label per call (never the same call for different kinds)", async () => {
    const llmTechnical = new FakeLlmAdapter().enqueueJson({ questions: [] });
    const llmBehavioural = new FakeLlmAdapter().enqueueJson({ questions: [] });
    await generateQuestionsForCategory(requirements, "technical", "", { llm: llmTechnical }, makeCounter("q"));
    await generateQuestionsForCategory(requirements, "behavioural", "", { llm: llmBehavioural }, makeCounter("q"));
    expect(llmTechnical.callLog[0]!.system).toContain('"technical"');
    expect(llmBehavioural.callLog[0]!.system).toContain('"behavioural"');
    expect(llmTechnical.callLog[0]!.system).not.toEqual(llmBehavioural.callLog[0]!.system);
  });

  it("defensively drops a question whose requirement_ids reference no real requirement (hallucination guard)", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({
      questions: [
        { requirement_ids: ["r-does-not-exist"], prompt: "bad", answer_outline: "", difficulty: 1 },
        { requirement_ids: ["r1"], prompt: "good", answer_outline: "", difficulty: 1 },
      ],
    });
    const result = await generateQuestionsForCategory(requirements, "technical", "", { llm }, makeCounter("q"));
    expect(result).toHaveLength(1);
    expect(result[0]!.prompt).toBe("good");
  });

  it("filters out a dangling requirement id but keeps the question if at least one id is valid", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({
      questions: [{ requirement_ids: ["r1", "r-bogus"], prompt: "q", answer_outline: "", difficulty: 1 }],
    });
    const result = await generateQuestionsForCategory(requirements, "technical", "", { llm }, makeCounter("q"));
    expect(result[0]!.requirement_ids).toEqual(["r1"]);
  });

  it("includes hiring-process notes in the prompt so questions can adapt to what was found (Section 3)", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({ questions: [] });
    await generateQuestionsForCategory(requirements, "technical", "They give a take-home followed by a system design round.", { llm }, makeCounter("q"));
    expect(llm.callLog[0]!.prompt).toContain("take-home");
  });
});
