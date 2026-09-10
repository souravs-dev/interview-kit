import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Mirrors the Appendix A kit structure (shared/src/schema/kit.ts) field
 * for field, plus the wrapper fields (userId, status, dedupe_key, etc.)
 * needed to persist and own a kit. The _meta blocks are what make
 * non-destructive section regeneration possible (RFC-001 section 3.3).
 */

const itemMetaSchema = new Schema(
  {
    source: { type: String, enum: ["generated", "edited", "user_added"], required: true },
    pinned: { type: Boolean, required: true, default: false },
    order: { type: Number, required: true },
    generatedAt: { type: String, default: null },
    editedAt: { type: String, default: null },
    generationBatch: { type: String, default: null },
  },
  { _id: false },
);

const requirementSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: ["technical", "behavioural", "domain"], required: true },
    priority: { type: String, enum: ["must", "nice"], required: true },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
    category: { type: String, enum: ["technical", "behavioural", "system-design", "company-fit"], required: true },
    prompt: { type: String, required: true },
    answer_outline: { type: String, required: true },
    difficulty: { type: Number, enum: [1, 2, 3], required: true },
    _meta: { type: itemMetaSchema, required: false },
  },
  { _id: false },
);

const practiceHistorySchema = new Schema(
  { confidence: { type: Number, enum: [1, 2, 3, 4, 5], required: true }, at: { type: String, required: true } },
  { _id: false },
);

const practiceSchema = new Schema(
  {
    lastConfidence: { type: Number, enum: [1, 2, 3, 4, 5], default: null },
    lastReviewedAt: { type: String, default: null },
    timesReviewed: { type: Number, default: 0 },
    history: { type: [practiceHistorySchema], default: [] },
  },
  { _id: false },
);

const flashcardSchema = new Schema(
  {
    id: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
    _meta: { type: itemMetaSchema, required: false },
    practice: { type: practiceSchema, required: false },
  },
  { _id: false },
);

const scheduleDaySchema = new Schema(
  {
    day: { type: Number, required: true },
    focus: { type: String, required: true },
    question_ids: { type: [String], default: [] },
    minutes: { type: Number, required: true },
  },
  { _id: false },
);

const kitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    schema_version: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ["queued", "generating", "ready", "failed"], required: true, default: "queued" },
    batchId: { type: Schema.Types.ObjectId, default: null },
    dedupe_key: { type: String, required: true },
    /** Original input text, retained for section-level regeneration (RFC-001 section 3.3). */
    jd: { type: String, required: true },

    source: {
      company: { type: String, default: "" },
      company_url: { type: String, required: true },
      role: { type: String, default: "" },
      location: { type: String, default: "" },
      jd_chars: { type: Number, default: 0 },
      researched_at: { type: String, default: "" },
      pages_used: { type: [String], default: [] },
    },
    company_brief: {
      summary: { type: String, default: "" },
      what_they_do: { type: String, default: "" },
      sources: { type: [String], default: [] },
      _meta: { type: itemMetaSchema, required: false },
    },
    role: {
      title: { type: String, default: "" },
      seniority: { type: String, default: "" },
      responsibilities: { type: [String], default: [] },
      requirements: { type: [requirementSchema], default: [] },
    },
    questions: { type: [questionSchema], default: [] },
    flashcards: { type: [flashcardSchema], default: [] },
    schedule: {
      days_available: { type: Number, default: 0 },
      days: { type: [scheduleDaySchema], default: [] },
      _meta: { type: itemMetaSchema, required: false },
    },
    coverage: {
      uncovered_requirement_ids: { type: [String], default: [] },
      passes: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// Duplicate-submission detection (Section 10) is enforced at the
// application level (kitRepository.findExistingKitByDedupeKey), not as a
// DB-level unique constraint: MongoDB partial-index filter expressions only
// support $eq/$exists/comparison operators combined via $and, which can't
// express "unique except among failed records" ($ne is unsupported there).
// A race between two concurrent identical submissions is low-stakes (an
// extra similar kit, not a data-integrity or security issue), so an
// indexed-but-non-unique field plus an app-level check-before-create is the
// simpler, honest tradeoff over working around the partial-index limitation.
kitSchema.index({ userId: 1, dedupe_key: 1 });

export type KitDoc = InferSchemaType<typeof kitSchema>;
export const KitModel = (models.Kit as Model<KitDoc>) ?? model<KitDoc>("Kit", kitSchema);
