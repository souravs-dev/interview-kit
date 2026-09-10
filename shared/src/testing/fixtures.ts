import type { Kit } from "../schema/kit.js";

/**
 * A minimal, structurally-valid kit fixture for tests across the shared,
 * backend, and (later) frontend packages. Deliberately small — tests that
 * need more requirements/questions build on top of this with spread.
 */
export function buildValidKitFixture(overrides: Partial<Kit> = {}): Kit {
  const base: Kit = {
    source: {
      company: "Acme Corp",
      company_url: "http://localhost:8099/acme/",
      role: "Senior Backend Engineer",
      location: "Remote",
      jd_chars: 512,
      researched_at: "2026-09-01T09:12:44Z",
      pages_used: ["http://localhost:8099/acme/", "http://localhost:8099/acme/careers"],
    },
    company_brief: {
      summary: "Acme Corp builds developer tools.",
      what_they_do: "Developer tools for backend engineers.",
      sources: ["http://localhost:8099/acme/"],
    },
    role: {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Design and build backend services"],
      requirements: [
        { id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "Experience mentoring junior engineers", kind: "behavioural", priority: "must" },
        { id: "r3", text: "Familiarity with GraphQL", kind: "technical", priority: "nice" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Walk through how you'd design a rate limiter for a public API.",
        answer_outline: "Token bucket vs sliding window; discuss tradeoffs.",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Tell me about a time you mentored a junior engineer.",
        answer_outline: "STAR format; focus on growth outcome.",
        difficulty: 1,
      },
    ],
    flashcards: [{ id: "f1", front: "What is a rate limiter?", back: "A mechanism to cap request throughput.", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 60 },
        { day: 2, focus: "Behavioural prep", question_ids: ["q2"], minutes: 45 },
      ],
    },
    coverage: { uncovered_requirement_ids: ["r3"], passes: 1 },
  };

  return { ...base, ...overrides };
}
