import { Router, type Response } from "express";
import { z } from "zod";
import type { PipelineDeps } from "../pipeline/types.js";
import { KitModel } from "../db/models/Kit.js";
import { getOwnedKit } from "../repositories/kitRepository.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { computeDedupeKey } from "../utils/dedupeKey.js";
import { createJobRecord, runGenerationInBackground } from "../services/kitGenerationService.js";
import { runRegenerationInBackground, type RegenerableSection } from "../services/regenerationService.js";
import { checkCoverage } from "../pipeline/steps/coverageChecker.js";
import { makeIdAllocator, nextOrderAfter } from "../services/regenerationMerge.js";

function pipelineDeps(res: Response): PipelineDeps {
  return res.app.locals.pipelineDeps as PipelineDeps;
}

/** Ownership-scoped lookup, responding 404 itself if not found — callers check the return value and return early if null. */
async function loadOwnedKitOr404(req: AuthedRequest, res: Response) {
  const kit = await getOwnedKit(req.params.id!, req.userId!);
  if (!kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
    return null;
  }
  return kit;
}

const CreateKitBody = z.object({
  jd: z.string().min(1),
  company_url: z.string().url(),
  days: z.number().int().positive(),
  force: z.boolean().optional(),
});

const RegenerateBody = z.object({
  section: z.enum(["company_brief", "questions:technical", "questions:behavioural", "questions:system-design", "questions:company-fit", "flashcards", "schedule"]),
});

const EditQuestionBody = z.object({
  prompt: z.string().optional(),
  answer_outline: z.string().optional(),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  requirement_ids: z.array(z.string()).optional(),
});

const AddQuestionBody = z.object({
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string(),
  answer_outline: z.string(),
  requirement_ids: z.array(z.string()).default([]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const ReorderBody = z.object({
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  ordered_ids: z.array(z.string()),
});

const MoveBody = z.object({ to_category: z.enum(["technical", "behavioural", "system-design", "company-fit"]) });

const PinBody = z.object({ pinned: z.boolean() });

const EditFlashcardBody = z.object({ front: z.string().optional(), back: z.string().optional(), requirement_ids: z.array(z.string()).optional() });

const AddFlashcardBody = z.object({ front: z.string(), back: z.string(), requirement_ids: z.array(z.string()).default([]) });

const ConfidenceBody = z.object({ confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) });

/**
 * Factory, not a module-level singleton — the generation rate limiter's
 * bucket state needs to live on the app instance, not the module (see the
 * same note in auth.routes.ts createAuthRouter).
 */
export function createKitsRouter(): Router {
  const kitsRouter: Router = Router();
  kitsRouter.use(requireAuth);

  const generationRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }); // cost control (Section 7)

  kitsRouter.post("/", generationRateLimiter, async (req: AuthedRequest, res, next) => {
    try {
      const parsed = CreateKitBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues.map((i) => i.message).join("; ") } });
        return;
      }
      const { jd, company_url, days, force } = parsed.data;
      const dedupeKey = computeDedupeKey(jd, company_url);

      if (!force) {
        const existing = await KitModel.findOne({ userId: req.userId, dedupe_key: dedupeKey, status: { $ne: "failed" } }).select("_id");
        if (existing) {
          res.status(409).json({ error: { code: "DUPLICATE_KIT", message: "An identical kit already exists" }, existing_kit_id: String(existing._id) });
          return;
        }
      }

      const kit = await KitModel.create({
        userId: req.userId,
        dedupe_key: dedupeKey,
        jd,
        status: "queued",
        source: { company_url },
      });
      const jobId = await createJobRecord(String(kit._id), req.userId!, "generate", null);
      runGenerationInBackground(String(kit._id), jobId, { jd, company_url, days }, pipelineDeps(res));

      res.status(202).json({ kit_id: String(kit._id), job_id: jobId, status: "queued" });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.get("/", async (req: AuthedRequest, res, next) => {
    try {
      const kits = await KitModel.find({ userId: req.userId })
        .select("source.company source.role status createdAt")
        .sort({ createdAt: -1 })
        .exec();
      res.json({
        kits: kits.map((k) => ({ id: String(k._id), company: k.source.company, role: k.source.role, status: k.status, createdAt: k.createdAt })),
      });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      res.json({ kit });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      await kit.deleteOne();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/regenerate", generationRateLimiter, async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const parsed = RegenerateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid section" } });
        return;
      }
      const section = parsed.data.section as RegenerableSection;
      const stepName = section.startsWith("questions:") ? "generate_questions" : section === "flashcards" ? "generate_flashcards" : section === "schedule" ? "allocate_schedule" : "generate_company_brief";
      const jobId = await createJobRecord(String(kit._id), req.userId!, "regenerate", section, [stepName as never]);
      runRegenerationInBackground(kit, jobId, section, pipelineDeps(res));
      res.status(202).json({ job_id: jobId, status: "queued" });
    } catch (error) {
      next(error);
    }
  });

  // --- Builder mutations: questions ---

  kitsRouter.patch("/:id/questions/:qid", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const question = kit.questions.find((q) => q.id === req.params.qid);
      if (!question) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
        return;
      }
      const parsed = EditQuestionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues.map((i) => i.message).join("; ") } });
        return;
      }
      Object.assign(question, parsed.data);
      if (!question._meta) {
        question._meta = { source: "edited", pinned: false, order: 0, generatedAt: null, editedAt: null, generationBatch: null };
      }
      if (question._meta.source !== "user_added") question._meta.source = "edited";
      question._meta.editedAt = new Date().toISOString();
      await kit.save();
      res.json({ question, coverage: kit.coverage });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/questions", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const parsed = AddQuestionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: parsed.error.issues.map((i) => i.message).join("; ") } });
        return;
      }
      const nextId = makeIdAllocator(
        kit.questions.map((q) => q.id),
        "q",
      );
      const order = nextOrderAfter(kit.questions.filter((q) => q.category === parsed.data.category) as never);
      kit.questions.push({
        id: nextId(),
        ...parsed.data,
        _meta: { source: "user_added", pinned: false, order, generatedAt: null, editedAt: null, generationBatch: null },
      });
      const coverage = checkCoverage(kit.role.requirements as never, kit.questions as never);
      kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
      await kit.save();
      res.status(201).json({ question: kit.questions[kit.questions.length - 1], coverage: kit.coverage });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.delete("/:id/questions/:qid", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const idx = kit.questions.findIndex((q) => q.id === req.params.qid);
      if (idx === -1) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
        return;
      }
      kit.questions.splice(idx, 1);
      const coverage = checkCoverage(kit.role.requirements as never, kit.questions as never);
      kit.coverage.uncovered_requirement_ids = coverage.uncoveredRequirementIds;
      await kit.save();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/questions/reorder", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const parsed = ReorderBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid reorder request" } });
        return;
      }
      parsed.data.ordered_ids.forEach((id, i) => {
        const question = kit.questions.find((q) => q.id === id && q.category === parsed.data.category);
        if (question?._meta) question._meta.order = (i + 1) * 1000;
      });
      await kit.save();
      res.json({
        questions: kit.questions
          .filter((q) => q.category === parsed.data.category)
          .sort((a, b) => (a._meta?.order ?? 0) - (b._meta?.order ?? 0)),
      });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/questions/:qid/move", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const question = kit.questions.find((q) => q.id === req.params.qid);
      if (!question) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
        return;
      }
      const parsed = MoveBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid category" } });
        return;
      }
      question.category = parsed.data.to_category;
      const order = nextOrderAfter(kit.questions.filter((q) => q.category === parsed.data.to_category && q.id !== question.id) as never);
      if (question._meta) question._meta.order = order;
      await kit.save();
      res.json({ question });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/questions/:qid/pin", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const question = kit.questions.find((q) => q.id === req.params.qid);
      if (!question) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found" } });
        return;
      }
      const parsed = PinBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid pin request" } });
        return;
      }
      if (question._meta) question._meta.pinned = parsed.data.pinned;
      await kit.save();
      res.json({ question });
    } catch (error) {
      next(error);
    }
  });

  // --- Builder mutations: flashcards (same shape, no category concept) ---

  kitsRouter.patch("/:id/flashcards/:fid", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const flashcard = kit.flashcards.find((f) => f.id === req.params.fid);
      if (!flashcard) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
        return;
      }
      const parsed = EditFlashcardBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid flashcard edit" } });
        return;
      }
      Object.assign(flashcard, parsed.data);
      if (!flashcard._meta) {
        flashcard._meta = { source: "edited", pinned: false, order: 0, generatedAt: null, editedAt: null, generationBatch: null };
      }
      if (flashcard._meta.source !== "user_added") flashcard._meta.source = "edited";
      flashcard._meta.editedAt = new Date().toISOString();
      await kit.save();
      res.json({ flashcard });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/flashcards", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const parsed = AddFlashcardBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid flashcard" } });
        return;
      }
      const nextId = makeIdAllocator(
        kit.flashcards.map((f) => f.id),
        "f",
      );
      const order = nextOrderAfter(kit.flashcards as never);
      kit.flashcards.push({
        id: nextId(),
        ...parsed.data,
        _meta: { source: "user_added", pinned: false, order, generatedAt: null, editedAt: null, generationBatch: null },
      });
      await kit.save();
      res.status(201).json({ flashcard: kit.flashcards[kit.flashcards.length - 1] });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.delete("/:id/flashcards/:fid", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const idx = kit.flashcards.findIndex((f) => f.id === req.params.fid);
      if (idx === -1) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
        return;
      }
      kit.flashcards.splice(idx, 1);
      await kit.save();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.post("/:id/flashcards/:fid/pin", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const flashcard = kit.flashcards.find((f) => f.id === req.params.fid);
      if (!flashcard) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
        return;
      }
      const parsed = PinBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid pin request" } });
        return;
      }
      if (flashcard._meta) flashcard._meta.pinned = parsed.data.pinned;
      await kit.save();
      res.json({ flashcard });
    } catch (error) {
      next(error);
    }
  });

  // --- Practice mode ---

  kitsRouter.post("/:id/flashcards/:fid/confidence", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const flashcard = kit.flashcards.find((f) => f.id === req.params.fid);
      if (!flashcard) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found" } });
        return;
      }
      const parsed = ConfidenceBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid confidence value" } });
        return;
      }
      const now = new Date().toISOString();
      flashcard.practice.lastConfidence = parsed.data.confidence;
      flashcard.practice.lastReviewedAt = now;
      flashcard.practice.timesReviewed += 1;
      flashcard.practice.history.push({ confidence: parsed.data.confidence, at: now });
      if (flashcard.practice.history.length > 20) {
        flashcard.practice.history.splice(0, flashcard.practice.history.length - 20);
      }
      await kit.save();
      res.json({ flashcard: { id: flashcard.id, practice: flashcard.practice } });
    } catch (error) {
      next(error);
    }
  });

  kitsRouter.get("/:id/practice/session", async (req: AuthedRequest, res, next) => {
    try {
      const kit = await loadOwnedKitOr404(req, res);
      if (!kit) return;
      const queue = [...kit.flashcards].sort((a, b) => {
        const aConf = a.practice?.lastConfidence ?? 0; // never-reviewed sorts first (0 < any real confidence)
        const bConf = b.practice?.lastConfidence ?? 0;
        return aConf - bConf;
      });
      const reviewed = kit.flashcards.filter((f) => (f.practice?.timesReviewed ?? 0) > 0).length;
      res.json({
        queue: queue.map((f) => ({ id: f.id, front: f.front, back: f.back, lastConfidence: f.practice?.lastConfidence ?? null, timesReviewed: f.practice?.timesReviewed ?? 0 })),
        coverage: { total: kit.flashcards.length, reviewed, remaining: kit.flashcards.length - reviewed },
      });
    } catch (error) {
      next(error);
    }
  });

  return kitsRouter;
}
