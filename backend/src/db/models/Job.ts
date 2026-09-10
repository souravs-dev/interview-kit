import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const jobStepSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ["pending", "running", "done", "failed"], required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    error: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const jobSchema = new Schema(
  {
    kitId: { type: Schema.Types.ObjectId, required: true, ref: "Kit", index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    type: { type: String, enum: ["generate", "regenerate"], required: true },
    section: { type: String, default: null },
    status: { type: String, enum: ["running", "done", "failed"], required: true, default: "running" },
    steps: { type: [jobStepSchema], default: [] },
    error: { type: Schema.Types.Mixed, default: null },
    // TTL cleanup — jobs are transient progress records; kit.status is the
    // durable source of truth (RFC-001 section 3.1/6.2).
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

jobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type JobDoc = InferSchemaType<typeof jobSchema>;
export const Job = (mongoose.models.Job as Model<JobDoc>) ?? model<JobDoc>("Job", jobSchema);
