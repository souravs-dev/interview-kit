import { describe, expect, it } from "vitest";
import { z } from "zod";
import { completeJson, LlmJsonError } from "../completeJson.js";
import { FakeLlmAdapter } from "../fakes/FakeLlmAdapter.js";

const schema = z.object({ value: z.string() });

describe("completeJson", () => {
  it("returns parsed data on a valid first response", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({ value: "ok" });
    const result = await completeJson(llm, { system: "sys", prompt: "prompt", schema });
    expect(result).toEqual({ value: "ok" });
    expect(llm.callCount).toBe(1);
  });

  it("extracts JSON from a markdown code fence", async () => {
    const llm = new FakeLlmAdapter().enqueueText('```json\n{"value": "fenced"}\n```');
    const result = await completeJson(llm, { system: "sys", prompt: "prompt", schema });
    expect(result).toEqual({ value: "fenced" });
  });

  it("repairs a malformed first response with one bounded reprompt", async () => {
    const llm = new FakeLlmAdapter().enqueueText("not json at all").enqueueJson({ value: "repaired" });
    const result = await completeJson(llm, { system: "sys", prompt: "prompt", schema });
    expect(result).toEqual({ value: "repaired" });
    expect(llm.callCount).toBe(2);
  });

  it("repairs a response that is valid JSON but fails the schema", async () => {
    const llm = new FakeLlmAdapter().enqueueJson({ wrong_field: 1 }).enqueueJson({ value: "repaired" });
    const result = await completeJson(llm, { system: "sys", prompt: "prompt", schema });
    expect(result).toEqual({ value: "repaired" });
  });

  it("throws LlmJsonError honestly after the repair attempt also fails (AC-023)", async () => {
    const llm = new FakeLlmAdapter().enqueueText("still not json").enqueueText("still not json either");
    await expect(completeJson(llm, { system: "sys", prompt: "prompt", schema })).rejects.toThrow(LlmJsonError);
    expect(llm.callCount).toBe(2); // bounded: exactly one repair attempt, never unbounded retries
  });

  it("propagates adapter errors (e.g. rate limit) without treating them as malformed JSON", async () => {
    const llm = new FakeLlmAdapter().enqueueError(new Error("rate limited"));
    await expect(completeJson(llm, { system: "sys", prompt: "prompt", schema })).rejects.toThrow("rate limited");
  });
});
