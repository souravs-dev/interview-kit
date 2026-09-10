import { z } from "zod";

/**
 * The exact kit structure required by the assessment brief, Appendix A.
 * Field names must match exactly. `_meta` blocks are the one permitted
 * extension (the brief allows extending the structure where it genuinely
 * helps) — they carry the generated/edited/pinned state that makes
 * non-destructive section regeneration possible. See RFC-001 section 3.3.
 */

export const RequirementKind = z.enum(["technical", "behavioural", "domain"]);
export type RequirementKind = z.infer<typeof RequirementKind>;

export const RequirementPriority = z.enum(["must", "nice"]);
export type RequirementPriority = z.infer<typeof RequirementPriority>;

export const QuestionCategory = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export type QuestionCategory = z.infer<typeof QuestionCategory>;

export const ItemSource = z.enum(["generated", "edited", "user_added"]);
export type ItemSource = z.infer<typeof ItemSource>;

/** Generated/edited/pinned bookkeeping for one builder-editable item. */
export const ItemMeta = z.object({
  source: ItemSource,
  pinned: z.boolean(),
  order: z.number(),
  generatedAt: z.string().nullable(),
  editedAt: z.string().nullable(),
  generationBatch: z.string().nullable(),
});
export type ItemMeta = z.infer<typeof ItemMeta>;

export const Source = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});
export type Source = z.infer<typeof Source>;

export const CompanyBrief = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
  _meta: ItemMeta.optional(),
});
export type CompanyBrief = z.infer<typeof CompanyBrief>;

export const Requirement = z.object({
  id: z.string(),
  text: z.string(),
  kind: RequirementKind,
  priority: RequirementPriority,
});
export type Requirement = z.infer<typeof Requirement>;

export const Role = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(Requirement),
});
export type Role = z.infer<typeof Role>;

export const Question = z.object({
  id: z.string(),
  requirement_ids: z.array(z.string()),
  category: QuestionCategory,
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  _meta: ItemMeta.optional(),
});
export type Question = z.infer<typeof Question>;

export const Flashcard = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
  _meta: ItemMeta.optional(),
  practice: z
    .object({
      lastConfidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
      lastReviewedAt: z.string().nullable(),
      timesReviewed: z.number().int().nonnegative(),
      history: z.array(
        z.object({
          confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
          at: z.string(),
        }),
      ),
    })
    .optional(),
});
export type Flashcard = z.infer<typeof Flashcard>;

export const ScheduleDay = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});
export type ScheduleDay = z.infer<typeof ScheduleDay>;

export const Schedule = z.object({
  days_available: z.number().int().positive(),
  days: z.array(ScheduleDay),
  _meta: ItemMeta.optional(),
});
export type Schedule = z.infer<typeof Schedule>;

export const Coverage = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});
export type Coverage = z.infer<typeof Coverage>;

/** The exact Appendix A shape. */
export const KitSchema = z.object({
  source: Source,
  company_brief: CompanyBrief,
  role: Role,
  questions: z.array(Question),
  flashcards: z.array(Flashcard),
  schedule: Schedule,
  coverage: Coverage,
});
export type Kit = z.infer<typeof KitSchema>;

export interface KitValidationError {
  code: string;
  message: string;
  path: (string | number)[];
}

export interface KitValidationResult {
  valid: boolean;
  errors: KitValidationError[];
}

/**
 * Validates a kit against the exact Appendix A structure PLUS the
 * cross-referential invariants the brief calls out explicitly:
 * every question_ids entry in the schedule must reference a question
 * that exists, and every id must be stable/unique within the kit.
 * This is the single choke point every assembled kit passes through
 * before it is persisted or written to the batch CLI's output file.
 */
export function validateKit(candidate: unknown): KitValidationResult {
  const parsed = KitSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  const kit = parsed.data;
  const errors: KitValidationError[] = [];

  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
  const questionIds = new Set(kit.questions.map((q) => q.id));
  const flashcardIds = new Set(kit.flashcards.map((f) => f.id));

  if (requirementIds.size !== kit.role.requirements.length) {
    errors.push({ code: "DUPLICATE_ID", message: "Duplicate requirement id", path: ["role", "requirements"] });
  }
  if (questionIds.size !== kit.questions.length) {
    errors.push({ code: "DUPLICATE_ID", message: "Duplicate question id", path: ["questions"] });
  }
  if (flashcardIds.size !== kit.flashcards.length) {
    errors.push({ code: "DUPLICATE_ID", message: "Duplicate flashcard id", path: ["flashcards"] });
  }

  kit.questions.forEach((q, qi) => {
    q.requirement_ids.forEach((rid, ri) => {
      if (!requirementIds.has(rid)) {
        errors.push({
          code: "DANGLING_REQUIREMENT_ID",
          message: `Question ${q.id} references unknown requirement ${rid}`,
          path: ["questions", qi, "requirement_ids", ri],
        });
      }
    });
  });

  kit.flashcards.forEach((f, fi) => {
    f.requirement_ids.forEach((rid, ri) => {
      if (!requirementIds.has(rid)) {
        errors.push({
          code: "DANGLING_REQUIREMENT_ID",
          message: `Flashcard ${f.id} references unknown requirement ${rid}`,
          path: ["flashcards", fi, "requirement_ids", ri],
        });
      }
    });
  });

  kit.schedule.days.forEach((day, di) => {
    day.question_ids.forEach((qid, qi) => {
      if (!questionIds.has(qid)) {
        errors.push({
          code: "DANGLING_QUESTION_ID",
          message: `Schedule day ${day.day} references unknown question ${qid}`,
          path: ["schedule", "days", di, "question_ids", qi],
        });
      }
    });
  });

  if (kit.schedule.days.length !== kit.schedule.days_available) {
    errors.push({
      code: "SCHEDULE_DAY_COUNT_MISMATCH",
      message: `schedule.days has ${kit.schedule.days.length} entries but days_available is ${kit.schedule.days_available}`,
      path: ["schedule", "days"],
    });
  }

  kit.coverage.uncovered_requirement_ids.forEach((rid, ri) => {
    if (!requirementIds.has(rid)) {
      errors.push({
        code: "DANGLING_REQUIREMENT_ID",
        message: `coverage.uncovered_requirement_ids references unknown requirement ${rid}`,
        path: ["coverage", "uncovered_requirement_ids", ri],
      });
    }
  });

  return { valid: errors.length === 0, errors };
}
