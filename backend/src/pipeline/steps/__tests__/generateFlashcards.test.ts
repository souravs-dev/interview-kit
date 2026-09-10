import { describe, expect, it } from "vitest";
import type { Question } from "@interview-prep-kit/shared";
import { generateFlashcards } from "../generateFlashcards.js";
import { FakeLlmAdapter } from "../../../adapters/fakes/FakeLlmAdapter.js";

const questions: Question[] = [
  { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain reconciliation.", answer_outline: "...", difficulty: 2 },
];

function makeCounter(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

describe("generateFlashcards", () => {
  it("returns an empty array without calling the LLM when there are no questions", async () => {
    const llm = new FakeLlmAdapter();
    const result = await generateFlashcards([], { llm }, makeCounter("f"));
    expect(result).toEqual([]);
    expect(llm.callCount).toBe(0);
  });

  it("assigns ids via the shared counter", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({
      flashcards: [{ front: "What is reconciliation?", back: "The diffing algorithm.", requirement_ids: ["r1"] }],
    });
    const result = await generateFlashcards(questions, { llm }, makeCounter("f"));
    expect(result).toEqual([{ id: "f1", front: "What is reconciliation?", back: "The diffing algorithm.", requirement_ids: ["r1"] }]);
  });

  it("drops requirement ids not covered by any input question (hallucination guard)", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({
      flashcards: [{ front: "f", back: "b", requirement_ids: ["r1", "r-bogus"] }],
    });
    const result = await generateFlashcards(questions, { llm }, makeCounter("f"));
    expect(result[0]!.requirement_ids).toEqual(["r1"]);
  });
});
