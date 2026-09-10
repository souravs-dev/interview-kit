import type { ZodType } from "zod";
import type { LlmAdapter } from "../pipeline/types.js";

export class LlmJsonError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
  ) {
    super(message);
    this.name = "LlmJsonError";
  }
}

function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1]! : raw).trim();
}

function tryParse<T>(raw: string, schema: ZodType<T>): { success: true; data: T } | { success: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlock(raw));
  } catch (error) {
    return { success: false, error: `JSON.parse failed: ${(error as Error).message}` };
  }
  const result = schema.safeParse(json);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

/**
 * Calls the LLM and parses its response against `schema`. If the first
 * response is malformed or doesn't match the schema, makes exactly one
 * bounded repair reprompt before giving up honestly — this is the direct
 * implementation of Section 10's "the model returns invalid JSON or an
 * incomplete kit" edge case: never silently fabricate a fallback, and
 * never retry unboundedly (that would blow the batch CLI's time budget).
 */
export async function completeJson<T>(
  llm: LlmAdapter,
  params: { system: string; prompt: string; schema: ZodType<T> },
): Promise<T> {
  const first = await llm.complete({ system: params.system, prompt: params.prompt });
  const firstResult = tryParse(first, params.schema);
  if (firstResult.success) return firstResult.data;

  const repairPrompt = [
    "Your previous response could not be parsed as valid JSON matching the required schema.",
    `Parse error: ${firstResult.error}`,
    "Your previous response was:",
    first,
    "",
    "Respond again with ONLY valid JSON matching the required schema. No prose, no markdown code fences, no explanation.",
  ].join("\n");

  const second = await llm.complete({ system: params.system, prompt: repairPrompt });
  const secondResult = tryParse(second, params.schema);
  if (secondResult.success) return secondResult.data;

  throw new LlmJsonError(`LLM returned invalid JSON after one repair attempt: ${secondResult.error}`, second);
}
