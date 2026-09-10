import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CaseOutputFile } from "@interview-prep-kit/shared";
import { runEvaluate } from "../evaluate.js";
import { FakeLlmAdapter } from "../../adapters/fakes/FakeLlmAdapter.js";
import { FakeSearchAdapter } from "../../adapters/fakes/FakeSearchAdapter.js";
import { FakeFetchAdapter } from "../../adapters/fakes/FakeFetchAdapter.js";

const COMPANY_URL = "http://localhost:8099/acme/";

function homepagePage() {
  return {
    url: COMPANY_URL,
    status: 200,
    contentType: "text/html",
    html: "<html><head><title>Acme Corp</title></head><body>We build tools.</body></html>",
  };
}

/** Enqueues one happy-path case's worth of LLM responses in the exact call order buildKit produces. */
function enqueueHappyPathCase(llm: FakeLlmAdapter) {
  llm
    .enqueueJson({
      role: { title: "Backend Engineer", seniority: "Mid", location: "Remote", responsibilities: ["Build services"] },
      requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
    })
    .enqueueJson({ summary: "Acme builds developer tools.", what_they_do: "Developer tooling." })
    .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "Explain event loop.", answer_outline: "...", difficulty: 2 }] })
    .enqueueJson({ questions: [] })
    .enqueueJson({ flashcards: [{ front: "What is the event loop?", back: "...", requirement_ids: ["r1"] }] });
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "evaluate-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("runEvaluate", () => {
  it("processes a happy-path case and writes valid Appendix B output", async () => {
    const llm = new FakeLlmAdapter();
    enqueueHappyPathCase(llm);
    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter().register(COMPANY_URL, homepagePage());

    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(inputPath, JSON.stringify([{ id: "case-01", jd: "Backend Engineer, 5+ years Node.js.", company_url: COMPANY_URL, days: 3 }]));

    const result = await runEvaluate(inputPath, outputPath, { llm, search, fetcher }, { concurrency: 1 });

    expect(CaseOutputFile.safeParse(result).success).toBe(true);
    expect(result.kits).toHaveLength(1);
    expect(result.kits[0]).toMatchObject({ id: "case-01", status: "ok" });

    const written = JSON.parse(await readFile(outputPath, "utf-8"));
    expect(written.kits[0].status).toBe("ok");
  });

  it("continues after one case fails, recording the failure rather than aborting the run (AC-014)", async () => {
    const llm = new FakeLlmAdapter();
    // case-01 fails: extractRequirements' LLM call throws and is never recovered
    llm.enqueueError(new Error("simulated rate limit"));
    // case-02 succeeds
    enqueueHappyPathCase(llm);

    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter().register(COMPANY_URL, homepagePage());

    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(
      inputPath,
      JSON.stringify([
        { id: "case-01", jd: "Backend Engineer.", company_url: COMPANY_URL, days: 2 },
        { id: "case-02", jd: "Backend Engineer, 5+ years Node.js.", company_url: COMPANY_URL, days: 3 },
      ]),
    );

    // concurrency: 1 so the two cases run strictly in input order, matching
    // the enqueued LLM response order above.
    const result = await runEvaluate(inputPath, outputPath, { llm, search, fetcher }, { concurrency: 1 });

    expect(result.kits).toHaveLength(2);
    const case1 = result.kits.find((k) => k.id === "case-01")!;
    const case2 = result.kits.find((k) => k.id === "case-02")!;
    expect(case1.status).toBe("failed");
    expect(case1.error?.message).toContain("simulated rate limit");
    expect(case1.kit).toBeNull();
    expect(case2.status).toBe("ok");
    expect(case2.kit).not.toBeNull();
  });

  it("records a malformed input row as its own failed entry without aborting the run", async () => {
    const llm = new FakeLlmAdapter();
    enqueueHappyPathCase(llm);
    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter().register(COMPANY_URL, homepagePage());

    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(
      inputPath,
      JSON.stringify([
        { id: "case-bad", jd: "Backend Engineer." }, // missing company_url and days
        { id: "case-good", jd: "Backend Engineer, 5+ years Node.js.", company_url: COMPANY_URL, days: 3 },
      ]),
    );

    const result = await runEvaluate(inputPath, outputPath, { llm, search, fetcher }, { concurrency: 1 });

    expect(result.kits).toHaveLength(2);
    const bad = result.kits.find((k) => k.id === "case-bad")!;
    expect(bad.status).toBe("failed");
    expect(bad.error?.code).toBe("INVALID_INPUT");
    const good = result.kits.find((k) => k.id === "case-good")!;
    expect(good.status).toBe("ok");
  });

  it("assigns a synthetic id to a malformed row that has no id at all", async () => {
    const llm = new FakeLlmAdapter();
    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter();

    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(inputPath, JSON.stringify([{ jd: "no id, no company_url, no days" }]));

    const result = await runEvaluate(inputPath, outputPath, { llm, search, fetcher }, { concurrency: 1 });

    expect(result.kits).toHaveLength(1);
    expect(result.kits[0]!.id).toBe("row-0");
    expect(result.kits[0]!.status).toBe("failed");
  });

  it("degrades an unparseable category response to an honest coverage gap rather than crashing the case", async () => {
    // An out-of-range difficulty fails generateQuestionsForCategory's own
    // schema, which completeJson tries to repair once; if the repair also
    // doesn't parse, the orchestrator catches it and that category yields
    // zero questions rather than throwing. With the resulting gap on a
    // must-have requirement, the coverage loop attempts one gap-fill pass;
    // if that also can't recover, the kit still ships as "ok" — a
    // structurally valid kit with the gap honestly disclosed in
    // coverage.uncovered_requirement_ids, per Section 4's "never fabricate
    // around a gap" principle. Every queued response here is deliberately
    // either malformed or empty to exercise exactly that path.
    const llm = new FakeLlmAdapter()
      .enqueueJson({
        role: { title: "Engineer", seniority: "Mid", location: "", responsibilities: [] },
        requirements: [{ text: "Node.js", kind: "technical", priority: "must" }],
      })
      .enqueueJson({ summary: "s", what_they_do: "w" })
      .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "p", answer_outline: "a", difficulty: 99 }] }) // technical: bad difficulty
      .enqueueJson({ questions: [] }) // consumed as technical's repair attempt (valid but empty)
      .enqueueJson({ flashcards: [] }); // consumed as system-design's (failing) parse attempt — mismatched shape

    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter().register(COMPANY_URL, homepagePage());

    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(inputPath, JSON.stringify([{ id: "case-01", jd: "Engineer role.", company_url: COMPANY_URL, days: 2 }]));

    const result = await runEvaluate(inputPath, outputPath, { llm, search, fetcher }, { concurrency: 1 });

    expect(result.kits).toHaveLength(1);
    const kitResult = result.kits[0]!;
    expect(kitResult.status).toBe("ok");
    expect(kitResult.kit!.questions).toEqual([]);
    expect(kitResult.kit!.coverage.uncovered_requirement_ids).toEqual(["r1"]);
    expect(CaseOutputFile.safeParse(result).success).toBe(true);
  });

  it("throws a clear error when the input file is not valid JSON", async () => {
    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(inputPath, "not json");

    await expect(
      runEvaluate(inputPath, outputPath, { llm: new FakeLlmAdapter(), search: new FakeSearchAdapter(), fetcher: new FakeFetchAdapter() }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("throws a clear error when the input file is not a JSON array", async () => {
    const inputPath = path.join(tmpDir, "cases.json");
    const outputPath = path.join(tmpDir, "kits.json");
    await writeFile(inputPath, JSON.stringify({ not: "an array" }));

    await expect(
      runEvaluate(inputPath, outputPath, { llm: new FakeLlmAdapter(), search: new FakeSearchAdapter(), fetcher: new FakeFetchAdapter() }),
    ).rejects.toThrow(/must contain a JSON array/);
  });
});
