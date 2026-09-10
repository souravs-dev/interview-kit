import { validateKit } from "@interview-prep-kit/shared";
import { buildKit, type BuildKitInput, type PipelineStepName, type StepEvent } from "../pipeline/orchestrator.js";
import type { PipelineDeps } from "../pipeline/types.js";
import { KitModel } from "../db/models/Kit.js";
import { Job } from "../db/models/Job.js";
import { stampGeneratedMeta } from "./metaStamping.js";

const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ALL_STEP_NAMES: PipelineStepName[] = [
  "extract_requirements",
  "crawl_company_site",
  "search_public_discussion",
  "generate_company_brief",
  "generate_questions",
  "check_coverage",
  "generate_flashcards",
  "allocate_schedule",
];

export async function createJobRecord(
  kitId: string,
  userId: string,
  type: "generate" | "regenerate",
  section: string | null,
  stepNames: PipelineStepName[] = ALL_STEP_NAMES,
): Promise<string> {
  const job = await Job.create({
    kitId,
    userId,
    type,
    section,
    status: "running",
    steps: stepNames.map((name) => ({ name, status: "pending" })),
    expiresAt: new Date(Date.now() + JOB_TTL_MS),
  });
  return String(job._id);
}

async function updateJobStep(jobId: string, event: StepEvent): Promise<void> {
  const timestampField = event.status === "running" ? { "steps.$.startedAt": new Date() } : { "steps.$.finishedAt": new Date() };
  await Job.updateOne({ _id: jobId, "steps.name": event.name }, { $set: { "steps.$.status": event.status, ...timestampField } });
}

/**
 * Runs buildKit in the background — fire-and-forget from the route
 * handler's perspective (RFC-001 ADR-2: async job + polling, not a
 * blocking request, since generation is 90s+). Never throws out of this
 * function; every failure is recorded on the Kit/Job documents instead,
 * which is what the polling client (GET /api/jobs/:id) reads.
 */
export function runGenerationInBackground(kitId: string, jobId: string, input: BuildKitInput, deps: PipelineDeps): void {
  void (async () => {
    try {
      await KitModel.updateOne({ _id: kitId }, { status: "generating" });
      const kit = await buildKit(input, deps, (event) => {
        void updateJobStep(jobId, event);
      });
      const validation = validateKit(kit);
      if (!validation.valid) {
        await KitModel.updateOne({ _id: kitId }, { status: "failed" });
        await Job.updateOne(
          { _id: jobId },
          { status: "failed", error: { code: "VALIDATION_FAILED", message: validation.errors.map((e) => e.message).join("; ") } },
        );
        return;
      }
      const stamped = stampGeneratedMeta(kit, jobId);
      await KitModel.updateOne({ _id: kitId }, { ...stamped, status: "ready" });
      await Job.updateOne({ _id: jobId }, { status: "done" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await KitModel.updateOne({ _id: kitId }, { status: "failed" }).catch(() => {});
      await Job.updateOne({ _id: jobId }, { status: "failed", error: { code: "UNKNOWN", message } }).catch(() => {});
    }
  })();
}
