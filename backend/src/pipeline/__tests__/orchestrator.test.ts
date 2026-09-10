import { describe, expect, it } from "vitest";
import { validateKit } from "@interview-prep-kit/shared";
import { buildKit, MAX_COVERAGE_PASSES, type StepEvent } from "../orchestrator.js";
import { FakeLlmAdapter } from "../../adapters/fakes/FakeLlmAdapter.js";
import { FakeSearchAdapter } from "../../adapters/fakes/FakeSearchAdapter.js";
import { FakeFetchAdapter } from "../../adapters/fakes/FakeFetchAdapter.js";

const COMPANY_URL = "http://localhost:8099/acme/";

function homepagePage(html = "<html><head><title>Acme Corp</title></head><body>We build tools.</body></html>") {
  return { url: COMPANY_URL, status: 200, contentType: "text/html", html };
}

function makeDeps() {
  return { llm: new FakeLlmAdapter(), search: new FakeSearchAdapter(), fetcher: new FakeFetchAdapter() };
}

describe("buildKit", () => {
  it("runs the full pipeline end-to-end and produces a kit that passes validateKit", async () => {
    const deps = makeDeps();
    deps.fetcher.register(COMPANY_URL, homepagePage());

    // LLM call order: extract -> brief -> technical -> system-design -> flashcards
    deps.llm
      .enqueueJson({
        role: { title: "Senior Backend Engineer", seniority: "Senior", location: "Remote", responsibilities: ["Build services"] },
        requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
      })
      .enqueueJson({ summary: "Acme builds developer tools.", what_they_do: "Developer tooling." })
      .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "Explain event loop.", answer_outline: "...", difficulty: 2 }] })
      .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "Design a rate limiter.", answer_outline: "...", difficulty: 3 }] })
      .enqueueJson({ flashcards: [{ front: "What is the event loop?", back: "...", requirement_ids: ["r1"] }] });

    const events: StepEvent[] = [];
    const kit = await buildKit({ jd: "Senior Backend Engineer, 5+ years Node.js required.", company_url: COMPANY_URL, days: 3 }, deps, (e) =>
      events.push(e),
    );

    const validation = validateKit(kit);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    expect(kit.role.requirements).toHaveLength(1);
    expect(kit.questions).toHaveLength(2);
    expect(kit.flashcards).toHaveLength(1);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBe(1);
    expect(kit.schedule.days).toHaveLength(3);
    expect(kit.source.jd_chars).toBe("Senior Backend Engineer, 5+ years Node.js required.".length);

    // Every step reported both a running and a done event.
    const stepNames = [
      "extract_requirements",
      "crawl_company_site",
      "search_public_discussion",
      "generate_company_brief",
      "generate_questions",
      "check_coverage",
      "generate_flashcards",
      "allocate_schedule",
    ];
    for (const name of stepNames) {
      expect(events.some((e) => e.name === name && e.status === "running")).toBe(true);
      expect(events.some((e) => e.name === name && e.status === "done")).toBe(true);
    }
  });

  it("closes a coverage gap on the second pass (AC-004)", async () => {
    const deps = makeDeps();
    deps.fetcher.register(COMPANY_URL, homepagePage());
    deps.llm
      .enqueueJson({
        role: { title: "Engineer", seniority: "Mid", location: "", responsibilities: [] },
        requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
      })
      .enqueueJson({ summary: "s", what_they_do: "w" })
      // initial pass: both technical and system-design categories miss the requirement
      .enqueueJson({ questions: [] })
      .enqueueJson({ questions: [] })
      // gap-fill pass: technical category covers it this time
      .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "gap-fill question", answer_outline: "", difficulty: 1 }] })
      .enqueueJson({ questions: [] })
      .enqueueJson({ flashcards: [] });

    const kit = await buildKit({ jd: "Engineer role requiring 5+ years Node.js.", company_url: COMPANY_URL, days: 2 }, deps);

    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBe(2);
    expect(kit.questions.some((q) => q.prompt === "gap-fill question")).toBe(true);
  });

  it("terminates honestly at MAX_COVERAGE_PASSES when a gap is never closed (AC-005)", async () => {
    const deps = makeDeps();
    deps.fetcher.register(COMPANY_URL, homepagePage());
    deps.llm
      .enqueueJson({
        role: { title: "Engineer", seniority: "Mid", location: "", responsibilities: [] },
        requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
      })
      .enqueueJson({ summary: "s", what_they_do: "w" })
      .enqueueJson({ questions: [] }) // initial technical: empty
      .enqueueJson({ questions: [] }) // initial system-design: empty
      .enqueueJson({ questions: [] }) // gap-fill technical: still empty
      .enqueueJson({ questions: [] }); // gap-fill system-design: still empty

    const kit = await buildKit({ jd: "Engineer role requiring 5+ years Node.js.", company_url: COMPANY_URL, days: 2 }, deps);

    expect(kit.coverage.uncovered_requirement_ids).toEqual(["r1"]);
    expect(kit.coverage.passes).toBe(MAX_COVERAGE_PASSES);
    expect(kit.questions).toEqual([]);
    // Still a structurally valid kit — the gap is disclosed, not hidden or fabricated around.
    expect(validateKit(kit).valid).toBe(true);
  });

  it("produces an honestly thin kit for a near-empty JD, without inventing requirements (AC-002)", async () => {
    const deps = makeDeps();
    deps.fetcher.register(COMPANY_URL, homepagePage());
    deps.llm
      .enqueueJson({ role: { title: "", seniority: "", location: "", responsibilities: [] }, requirements: [] })
      .enqueueJson({ summary: "s", what_they_do: "w" });
    // No question/flashcard calls expected — zero requirements means zero category calls.

    const kit = await buildKit({ jd: "Backend Engineer. Apply now.", company_url: COMPANY_URL, days: 5 }, deps);

    expect(kit.role.requirements).toEqual([]);
    expect(kit.questions).toEqual([]);
    expect(kit.flashcards).toEqual([]);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.schedule.days).toHaveLength(5);
    expect(validateKit(kit).valid).toBe(true);
    expect(deps.llm.callCount).toBe(2);
  });

  it("produces an honest kit when the company site is entirely unreachable (Section 10)", async () => {
    const deps = makeDeps(); // no fixture registered for COMPANY_URL -> fetch throws
    deps.llm
      .enqueueJson({
        role: { title: "Engineer", seniority: "Mid", location: "", responsibilities: [] },
        requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
      })
      // No generate_company_brief call: crawl produced zero pages, so the
      // brief step short-circuits without calling the LLM (see generateCompanyBrief).
      .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "q1", answer_outline: "", difficulty: 1 }] })
      .enqueueJson({ questions: [] })
      .enqueueJson({ flashcards: [{ front: "f", back: "b", requirement_ids: ["r1"] }] });

    const kit = await buildKit({ jd: "Engineer role requiring 5+ years Node.js.", company_url: COMPANY_URL, days: 2 }, deps);

    expect(kit.source.pages_used).toEqual([]);
    expect(kit.company_brief).toEqual({ summary: "", what_they_do: "", sources: [] });
    expect(validateKit(kit).valid).toBe(true);
    // Never searches public discussion under a guessed/fallback company name —
    // that tends to surface results for an unrelated "company" rather than
    // the honest "nothing found" this should degrade to instead.
    expect(deps.search.callLog).toEqual([]);
  });

  it("reports step failure progress and still surfaces the error when a step is truly unrecoverable", async () => {
    const deps = makeDeps();
    deps.fetcher.register(COMPANY_URL, homepagePage());
    // completeJson only repairs malformed JSON, not adapter-level errors — a
    // rate-limit error propagates immediately, no second call is made.
    deps.llm.enqueueError(new Error("rate limited"));

    const events: StepEvent[] = [];
    await expect(
      buildKit({ jd: "Engineer role requiring 5+ years Node.js.", company_url: COMPANY_URL, days: 2 }, deps, (e) => events.push(e)),
    ).rejects.toThrow();

    expect(events.some((e) => e.name === "extract_requirements" && e.status === "failed")).toBe(true);
  });
});
