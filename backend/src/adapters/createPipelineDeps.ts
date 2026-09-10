import type { LlmAdapter, PipelineDeps } from "../pipeline/types.js";
import { ClaudeAdapter } from "./ClaudeAdapter.js";
import { GeminiAdapter } from "./GeminiAdapter.js";
import { DuckDuckGoAdapter } from "./DuckDuckGoAdapter.js";
import { HttpFetchAdapter } from "./HttpFetchAdapter.js";

function createLlmAdapter(env: NodeJS.ProcessEnv): LlmAdapter {
  const provider = (env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY;
    const model = env.ANTHROPIC_MODEL;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
    if (!model) throw new Error("ANTHROPIC_MODEL is not set. Copy .env.example to .env and fill it in.");
    return new ClaudeAdapter({ apiKey, model });
  }

  if (provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY;
    const model = env.GEMINI_MODEL;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in.");
    if (!model) throw new Error("GEMINI_MODEL is not set. Copy .env.example to .env and fill it in.");
    return new GeminiAdapter({ apiKey, model });
  }

  throw new Error(`Unknown LLM_PROVIDER "${provider}" — expected "gemini" or "anthropic".`);
}

/**
 * Wires the real adapters from environment variables. Used by both the
 * Express app (M7/M8) and the batch CLI (M6) — one factory, so both
 * entry points construct the pipeline's dependencies identically.
 *
 * LLM provider is swappable via LLM_PROVIDER (default "gemini", since
 * Gemini has a standing free tier — see README for why the project
 * defaults here rather than to Anthropic, which requires paid credits).
 */
export function createPipelineDeps(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  return {
    llm: createLlmAdapter(env),
    search: new DuckDuckGoAdapter(),
    fetcher: new HttpFetchAdapter({ nodeEnv: env.NODE_ENV }),
  };
}
