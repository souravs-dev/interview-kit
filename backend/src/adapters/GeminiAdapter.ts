import { GoogleGenAI } from "@google/genai";
import type { LlmAdapter } from "../pipeline/types.js";
import { withRetry } from "./withRetry.js";

export interface GeminiAdapterOptions {
  apiKey: string;
  model: string;
}

function isRetryableGeminiError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/**
 * Gemini's 429 responses embed a `RetryInfo.retryDelay` (e.g. "51s") in
 * the error body — this is the server telling you exactly how long its
 * rate-limit window has left. A short exponential backoff can't usefully
 * wait that out; honoring the hint directly can, and the batch CLI's
 * 15-minute budget has ample slack for one such wait (RFC-001 section 9).
 */
export function extractGeminiRetryDelayMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return undefined;
  return Math.min(seconds + 1, 65) * 1000; // +1s safety margin, capped so a bad parse can't stall forever
}

/** Thin wrapper over @google/genai. All prompt/schema handling lives in the pipeline steps, not here. */
export class GeminiAdapter implements LlmAdapter {
  private client: GoogleGenAI;
  private model: string;

  constructor(options: GeminiAdapterOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async complete(input: { system: string; prompt: string }): Promise<string> {
    return withRetry(
      async () => {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: input.prompt,
          config: { systemInstruction: input.system },
        });
        const text = response.text;
        if (!text) {
          throw new Error("Gemini response contained no text content");
        }
        return text;
      },
      { maxAttempts: 3, isRetryable: isRetryableGeminiError, getDelayMs: extractGeminiRetryDelayMs },
    );
  }
}
