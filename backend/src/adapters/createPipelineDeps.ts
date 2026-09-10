import type { PipelineDeps } from "../pipeline/types.js";
import { ClaudeAdapter } from "./ClaudeAdapter.js";
import { DuckDuckGoAdapter } from "./DuckDuckGoAdapter.js";
import { HttpFetchAdapter } from "./HttpFetchAdapter.js";

/**
 * Wires the real adapters from environment variables. Used by both the
 * Express app (M7/M8) and the batch CLI (M6) — one factory, so both
 * entry points construct the pipeline's dependencies identically.
 */
export function createPipelineDeps(env: NodeJS.ProcessEnv = process.env): PipelineDeps {
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
  if (!model) throw new Error("ANTHROPIC_MODEL is not set. Copy .env.example to .env and fill it in.");

  return {
    llm: new ClaudeAdapter({ apiKey, model }),
    search: new DuckDuckGoAdapter(),
    fetcher: new HttpFetchAdapter({ nodeEnv: env.NODE_ENV }),
  };
}
