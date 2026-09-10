import type { Express } from "express";
import { createApp } from "../../app.js";
import { FakeLlmAdapter } from "../../adapters/fakes/FakeLlmAdapter.js";
import { FakeSearchAdapter } from "../../adapters/fakes/FakeSearchAdapter.js";
import { FakeFetchAdapter } from "../../adapters/fakes/FakeFetchAdapter.js";

const FRONTEND_ORIGIN = "http://localhost:3000";

export interface TestApp {
  app: Express;
  llm: FakeLlmAdapter;
  search: FakeSearchAdapter;
  fetcher: FakeFetchAdapter;
}

export function buildTestApp(): TestApp {
  const llm = new FakeLlmAdapter();
  const search = new FakeSearchAdapter();
  const fetcher = new FakeFetchAdapter();
  const app = createApp({ frontendOrigin: FRONTEND_ORIGIN, pipelineDeps: { llm, search, fetcher } });
  return { app, llm, search, fetcher };
}

export const ORIGIN_HEADER = { Origin: FRONTEND_ORIGIN };

/** Polls GET /api/jobs/:id until status is done/failed or the timeout elapses. */
export async function waitForJob(
  agent: { get: (url: string) => { set: (h: string, v: string) => Promise<{ body: { status: string } }> } },
  cookie: string,
  jobId: string,
  timeoutMs = 5000,
): Promise<{ status: string }> {
  const start = Date.now();
  for (;;) {
    const res = await agent.get(`/api/jobs/${jobId}`).set("Cookie", cookie);
    if (res.body.status === "done" || res.body.status === "failed") return res.body as { status: string };
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for job ${jobId}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
