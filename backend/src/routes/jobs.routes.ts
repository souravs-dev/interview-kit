import { Router } from "express";
import { Job } from "../db/models/Job.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const jobsRouter: Router = Router();
jobsRouter.use(requireAuth);

jobsRouter.get("/:jobId", async (req: AuthedRequest, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.jobId, userId: req.userId });
    if (!job) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found" } });
      return;
    }
    res.json({
      job_id: String(job._id),
      kit_id: String(job.kitId),
      status: job.status,
      steps: job.steps,
      error: job.error,
    });
  } catch (error) {
    next(error);
  }
});
