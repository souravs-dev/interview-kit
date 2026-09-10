import type { HydratedDocument } from "mongoose";
import type { KitDoc } from "../db/models/Kit.js";
import { Job } from "../db/models/Job.js";
import type { PipelineDeps } from "../pipeline/types.js";
import { generateQuestionsForCategory } from "../pipeline/steps/generateQuestions.js";
import { generateCompanyBrief } from "../pipeline/steps/generateCompanyBrief.js";
import { generateFlashcards } from "../pipeline/steps/generateFlashcards.js";
import { crawlCompanySite } from "../pipeline/steps/crawlCompanySite.js";
import { allocateSchedule } from "../pipeline/steps/scheduleAllocator.js";
import { checkCoverage } from "../pipeline/steps/coverageChecker.js";
import { makeIdAllocator, nextOrderAfter, partitionForRegeneration } from "./regenerationMerge.js";
import type { Flashcard, Question, QuestionCategory, Requirement } from "@interview-prep-kit/shared";

export type RegenerableSection =
  | "company_brief"
  | "questions:technical"
  | "questions:behavioural"
  | "questions:system-design"
  | "questions:company-fit"
  | "flashcards"
  | "schedule";

const QUESTION_CATEGORY_TO_KIND: Record<QuestionCategory, "technical" | "behavioural" | "domain"> = {
  technical: "technical",
  "system-design": "technical",
  behavioural: "behavioural",
  "company-fit": "domain",
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Regenerates one section of an already-generated kit. Array sections
 * (questions/flashcards) use the merge-preserve boundary from
 * regenerationMerge.ts — a hand-edited or pinned item survives even
 * within the category/section being regenerated (RFC-001 section 3.3).
 * Single-object sections (company_brief, schedule) are fully replaced —
 * the user explicitly asked to regenerate exactly that object.
 *
 * Mongoose's DocumentArray types don't structurally match the shared
 * Appendix A types (they carry subdocument methods the pipeline/merge
 * functions don't need), so plain data is read out via `.toObject()`-style
 * spreads / `as unknown as X[]` at the boundary where a Mongoose document
 * meets the plain-data pipeline and merge functions.
 */
export async function regenerateSection(kit: HydratedDocument<KitDoc>, section: RegenerableSection, deps: PipelineDeps, jobId: string): Promise<void> {
  if (section === "schedule") {
    const questions = kit.questions as unknown as Question[];
    const requirements = kit.role.requirements as unknown as Requirement[];
    const schedule = allocateSchedule(questions, requirements, kit.schedule.days_available);
    kit.schedule = {
      ...schedule,
      _meta: { source: "generated", pinned: false, order: 0, generatedAt: nowIso(), editedAt: null, generationBatch: jobId },
    } as unknown as HydratedDocument<KitDoc>["schedule"];
    return;
  }

  if (section === "company_brief") {
    const crawl = await crawlCompanySite(kit.source.company_url, deps);
    const content = await generateCompanyBrief(crawl.pages, kit.role.title, deps);
    kit.company_brief = {
      ...content,
      sources: crawl.pagesUsed,
      _meta: { source: "generated", pinned: false, order: 0, generatedAt: nowIso(), editedAt: null, generationBatch: jobId },
    } as unknown as HydratedDocument<KitDoc>["company_brief"];
    return;
  }

  if (section === "flashcards") {
    const currentFlashcards = kit.flashcards as unknown as Flashcard[];
    const { keep, discard } = partitionForRegeneration(currentFlashcards);
    if (discard.length === 0 && currentFlashcards.length > 0) return; // nothing unprotected to replace
    const nextId = makeIdAllocator(
      currentFlashcards.map((f) => f.id),
      "f",
    );
    const candidates = await generateFlashcards(kit.questions as unknown as Question[], deps, nextId);
    const order0 = nextOrderAfter(keep);
    const stamped: Flashcard[] = candidates.map((c, i) => ({
      ...c,
      _meta: { source: "generated", pinned: false, order: order0 + i * 1000, generatedAt: nowIso(), editedAt: null, generationBatch: jobId },
    }));
    kit.flashcards = [...keep, ...stamped] as unknown as HydratedDocument<KitDoc>["flashcards"];
    return;
  }

  // questions:<category>
  const category = section.split(":")[1] as QuestionCategory;
  const kind = QUESTION_CATEGORY_TO_KIND[category];
  const allRequirements = kit.role.requirements as unknown as Requirement[];
  const allQuestions = kit.questions as unknown as Question[];
  const relevantRequirements = allRequirements.filter((r) => r.kind === kind);
  const inCategory = allQuestions.filter((q) => q.category === category);
  const otherCategories = allQuestions.filter((q) => q.category !== category);
  const { keep, discard } = partitionForRegeneration(inCategory);

  const nextId = makeIdAllocator(
    allQuestions.map((q) => q.id),
    "q",
  );
  const candidates = discard.length > 0 || inCategory.length === 0 ? await generateQuestionsForCategory(relevantRequirements, category, "", deps, nextId) : [];
  const order0 = nextOrderAfter(keep);
  const stamped: Question[] = candidates.map((c, i) => ({
    ...c,
    _meta: { source: "generated", pinned: false, order: order0 + i * 1000, generatedAt: nowIso(), editedAt: null, generationBatch: jobId },
  }));
  kit.questions = [...otherCategories, ...keep, ...stamped] as unknown as HydratedDocument<KitDoc>["questions"];

  const coverage = checkCoverage(allRequirements, kit.questions as unknown as Question[]);
  kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
}

/** Fire-and-forget background runner, mirroring kitGenerationService's pattern for the initial generate job. */
export function runRegenerationInBackground(kit: HydratedDocument<KitDoc>, jobId: string, section: RegenerableSection, deps: PipelineDeps): void {
  void (async () => {
    try {
      await regenerateSection(kit, section, deps, jobId);
      await kit.save();
      await Job.updateOne({ _id: jobId }, { status: "done" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Job.updateOne({ _id: jobId }, { status: "failed", error: { code: "UNKNOWN", message } }).catch(() => {});
    }
  })();
}
