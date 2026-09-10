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
      { maxAttempts: 3, isRetryable: isRetryableGeminiError },
    );
  }
}
