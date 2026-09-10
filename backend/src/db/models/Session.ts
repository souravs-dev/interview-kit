import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const sessionSchema = new Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  expiresAt: { type: Date, required: true },
});

// TTL index: MongoDB sweeps expired documents periodically (not instantly),
// so this is cleanup, not the actual expiry enforcement — session lookups
// must still filter on expiresAt explicitly (see auth/sessions.ts).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const Session = (models.Session as Model<SessionDoc>) ?? model<SessionDoc>("Session", sessionSchema);
