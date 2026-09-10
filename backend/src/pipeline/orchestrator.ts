import type { CompanyBrief, Kit, Question, Requirement, RequirementKind, QuestionCategory } from "@interview-prep-kit/shared";
import type { PipelineDeps } from "./types.js";
import { extractRequirements } from "./steps/extractRequirements.js";
import { crawlCompanySite } from "./steps/crawlCompanySite.js";
import { generateCompanyBrief } from "./steps/generateCompanyBrief.js";
import { searchPublicDiscussion } from "./steps/searchPublicDiscussion.js";
import { generateQuestionsForCategory } from "./steps/generateQuestions.js";
import { generateFlashcards } from "./steps/generateFlashcards.js";
import { checkCoverage } from "./steps/coverageChecker.js";
import { allocateSchedule } from "./steps/scheduleAllocator.js";
import { deriveCompanyName } from "./deriveCompanyName.js";

export interface BuildKitInput {
  jd: string;
  company_url: string;
  days: number;
}

export type PipelineStepName =
  | "extract_requirements"
  | "crawl_company_site"
  | "search_public_discussion"
  | "generate_company_brief"
  | "generate_questions"
  | "check_coverage"
  | "generate_flashcards"
  | "allocate_schedule";

export interface StepEvent {
  name: PipelineStepName;
  status: "running" | "done" | "failed";
}

export type OnProgress = (event: StepEvent) => void;

/**
 * First draft + at most one gap-fill pass (RFC-001 section 10 decision).
 * Only must-have gaps trigger a second pass — a still-uncovered nice-to-have
 * is an acceptable, honestly-disclosed outcome, never a reason to keep
 * spending LLM calls chasing it.
 */
export const MAX_COVERAGE_PASSES = 2;

const KIND_TO_CATEGORIES: Record<RequirementKind, QuestionCategory[]> = {
  technical: ["technical", "system-design"],
  behavioural: ["behavioural"],
  domain: ["company-fit"],
};

function groupByCategory(requirements: Requirement[]): Map<QuestionCategory, Requirement[]> {
  const byCategory = new Map<QuestionCategory, Requirement[]>();
  for (const req of requirements) {
    for (const category of KIND_TO_CATEGORIES[req.kind]) {
      byCategory.set(category, [...(byCategory.get(category) ?? []), req]);
    }
  }
  return byCategory;
}

async function generateQuestionsForRequirements(
  requirements: Requirement[],
  hiringProcessNotes: string,
  deps: Pick<PipelineDeps, "llm">,
  nextQId: () => string,
): Promise<Question[]> {
  const byCategory = groupByCategory(requirements);
  const results = await Promise.all(
    [...byCategory.entries()].map(async ([category, reqs]) => {
      try {
        return await generateQuestionsForCategory(reqs, category, hiringProcessNotes, deps, nextQId);
      } catch {
        // Section 10: an LLM failure for one category degrades that
        // category to zero questions rather than aborting the whole kit —
        // the coverage loop gets a chance to fill the resulting gap.
        return [] as Question[];
      }
    }),
  );
  return results.flat();
}

/**
 * The single pipeline implementation — called identically by the Express
 * API (async job + polling) and the batch CLI (M6). Zero knowledge of
 * Express, Mongo, or file I/O; only the caller differs (RFC-001 section 3.1).
 */
export async function buildKit(input: BuildKitInput, deps: PipelineDeps, onProgress: OnProgress = () => {}): Promise<Kit> {
  const jdChars = input.jd.length;
  let qCounter = 0;
  let fCounter = 0;
  const nextQId = () => `q${++qCounter}`;
  const nextFId = () => `f${++fCounter}`;

  const run = async <T>(name: PipelineStepName, fn: () => Promise<T>): Promise<T> => {
    onProgress({ name, status: "running" });
    try {
      const result = await fn();
      onProgress({ name, status: "done" });
      return result;
    } catch (error) {
      onProgress({ name, status: "failed" });
      throw error;
    }
  };

  // Steps 1-4/6 fan out: JD extraction needs no retrieval, so it runs
  // concurrently with company-site crawling (RFC-001 section 3.2).
  const [extraction, crawl] = await Promise.all([
    run("extract_requirements", () => extractRequirements(input.jd, deps)),
    run("crawl_company_site", () => crawlCompanySite(input.company_url, deps)),
  ]);

  const companyName = deriveCompanyName(crawl.pages[0]?.title, input.company_url);

  const discussion = await run("search_public_discussion", () => searchPublicDiscussion(companyName, deps));
  const hiringProcessNotes = discussion.pages
    .map((p) => p.text)
    .join("\n\n")
    .slice(0, 4000);

  const briefContent = await run("generate_company_brief", async () => {
    try {
      return await generateCompanyBrief(crawl.pages, extraction.role.title, deps);
    } catch {
      return { summary: "", what_they_do: "" };
    }
  });
  const brief: CompanyBrief = { ...briefContent, sources: crawl.pagesUsed };

  // Step 7: one call per category — never the same call for different kinds.
  let questions = await run("generate_questions", () =>
    generateQuestionsForRequirements(extraction.requirements, hiringProcessNotes, deps, nextQId),
  );

  // Step 9 + the second pass (Section 4): deterministic check, gap-fill,
  // re-check. Capped at MAX_COVERAGE_PASSES so a stubborn gap can't spin.
  let coverage = checkCoverage(extraction.requirements, questions);
  let passes = 1;

  coverage = await run("check_coverage", async () => {
    let current = coverage;
    while (current.uncoveredMustHaveIds.length > 0 && passes < MAX_COVERAGE_PASSES) {
      const gapRequirements = extraction.requirements.filter((r) => current.uncoveredMustHaveIds.includes(r.id));
      const gapQuestions = await generateQuestionsForRequirements(gapRequirements, hiringProcessNotes, deps, nextQId);
      questions = [...questions, ...gapQuestions];
      passes += 1;
      current = checkCoverage(extraction.requirements, questions);
    }
    return current;
  });

  const flashcards = await run("generate_flashcards", async () => {
    try {
      return await generateFlashcards(questions, deps, nextFId);
    } catch {
      return [];
    }
  });

  const schedule = await run("allocate_schedule", async () => allocateSchedule(questions, extraction.requirements, input.days));

  const pagesUsed = [...new Set([...crawl.pagesUsed, ...discussion.sources])];

  return {
    source: {
      company: companyName,
      company_url: input.company_url,
      role: extraction.role.title,
      location: extraction.role.location,
      jd_chars: jdChars,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: brief,
    role: {
      title: extraction.role.title,
      seniority: extraction.role.seniority,
      responsibilities: extraction.role.responsibilities,
      requirements: extraction.requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes },
  };
}
