import type { LlmAdapter } from "../../pipeline/types.js";

type QueuedResponse = { type: "text"; value: string } | { type: "error"; error: Error };

/**
 * Configurable in-memory LLM adapter for tests. Enqueue text (valid or
 * deliberately malformed/truncated JSON) or errors (e.g. to simulate a
 * rate limit) and calls are served in order — this is what makes the
 * pipeline's malformed-JSON and rate-limit edge cases (Section 10)
 * testable without ever calling a real model.
 */
export class FakeLlmAdapter implements LlmAdapter {
  private queue: QueuedResponse[] = [];
  private calls: { system: string; prompt: string }[] = [];

  enqueueText(value: string): this {
    this.queue.push({ type: "text", value });
    return this;
  }

  enqueueJson(value: unknown): this {
    return this.enqueueText(JSON.stringify(value));
  }

  enqueueError(error: Error): this {
    this.queue.push({ type: "error", error });
    return this;
  }

  get callCount(): number {
    return this.calls.length;
  }

  get callLog(): ReadonlyArray<{ system: string; prompt: string }> {
    return this.calls;
  }

  async complete(input: { system: string; prompt: string }): Promise<string> {
    this.calls.push(input);
    const next = this.queue.shift();
    if (!next) {
      throw new Error(`FakeLlmAdapter: no queued response for call #${this.calls.length}`);
    }
    if (next.type === "error") throw next.error;
    return next.value;
  }
}
