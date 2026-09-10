import mongoose, { type HydratedDocument } from "mongoose";
import { KitModel, type KitDoc } from "../db/models/Kit.js";

/**
 * Ownership-scoped kit lookup — the query itself filters by userId, never
 * a separate `if` after an unscoped findById. This is a pattern, not a
 * per-endpoint judgment call: every kit-touching route (M8) should go
 * through this helper so IDOR prevention can't be forgotten on a new
 * endpoint (RFC-001 section 7 / QA plan AC-018).
 *
 * A malformed id (not a valid ObjectId) is treated the same as "not found"
 * rather than let Mongoose throw a CastError — callers already handle a
 * null return as a clean 404, so this avoids a route param typo turning
 * into an unhandled 500.
 */
export async function getOwnedKit(kitId: string, userId: string): Promise<HydratedDocument<KitDoc> | null> {
  if (!mongoose.isValidObjectId(kitId)) return null;
  return KitModel.findOne({ _id: kitId, userId }).exec();
}

export interface DedupeCheckResult {
  existingKitId: string | null;
}

/** Section 10: same JD + company submitted twice by the same user. */
export async function findExistingKitByDedupeKey(userId: string, dedupeKey: string): Promise<DedupeCheckResult> {
  const existing = await KitModel.findOne({ userId, dedupe_key: dedupeKey, status: { $ne: "failed" } })
    .select("_id")
    .exec();
  return { existingKitId: existing ? String(existing._id) : null };
}
