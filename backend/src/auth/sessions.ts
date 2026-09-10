import { randomBytes } from "node:crypto";
import { Session } from "../db/models/Session.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** Opaque, cryptographically random session token — never derived from or equal to a Mongo _id. */
export async function createSession(userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({ token, userId, expiresAt });
  return { token, expiresAt };
}

/**
 * Returns the session's userId, or null if the token doesn't exist or has
 * expired. Filters on expiresAt explicitly rather than relying on the TTL
 * index alone — Mongo's TTL sweep runs periodically, not instantly, so an
 * expired-but-not-yet-swept session must still be rejected here (Section 1:
 * "sensible handling of expired/invalid sessions").
 */
export async function getSessionUserId(token: string): Promise<string | null> {
  const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } });
  return session ? String(session.userId) : null;
}

export async function deleteSession(token: string): Promise<void> {
  await Session.deleteOne({ token });
}
