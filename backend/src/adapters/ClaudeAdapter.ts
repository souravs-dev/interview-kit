import Anthropic from "@anthropic-ai/sdk";
import type { LlmAdapter } from "../pipeline/types.js";
import { withRetry } from "./withRetry.js";

export interface ClaudeAdapterOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

function isRetryableAnthropicError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/** Thin wrapper over the Anthropic SDK. All prompt/schema handling lives in the pipeline steps, not here. */
export class ClaudeAdapter implements LlmAdapter {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: ClaudeAdapterOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 2048;
  }

  async complete(input: { system: string; prompt: string }): Promise<string> {
    return withRetry(
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: input.system,
          messages: [{ role: "user", content: input.prompt }],
        });
        const textBlock = response.content.find((block) => block.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("Claude response contained no text content block");
        }
        return textBlock.text;
      },
      { maxAttempts: 3, isRetryable: isRetryableAnthropicError },
    );
  }
}
