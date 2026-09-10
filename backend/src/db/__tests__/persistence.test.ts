import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb, clearTestDb } from "./testDb.js";
import { User } from "../models/User.js";
import { KitModel } from "../models/Kit.js";
import { hashPassword, verifyPassword } from "../../auth/passwords.js";
import { createSession, deleteSession, getSessionUserId } from "../../auth/sessions.js";
import { getOwnedKit, findExistingKitByDedupeKey } from "../../repositories/kitRepository.js";
import { computeDedupeKey } from "../../utils/dedupeKey.js";

beforeAll(async () => {
  await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

async function createTestUser(email: string): Promise<string> {
  const passwordHash = await hashPassword("correct-horse-battery-staple");
  const user = await User.create({ email, passwordHash });
  return String(user._id);
}

async function createTestKit(userId: string, overrides: Partial<{ company_url: string; jd: string; dedupe_key: string; status: string }> = {}) {
  const jd = overrides.jd ?? "Senior Backend Engineer";
  const company_url = overrides.company_url ?? "http://localhost:8099/acme/";
  return KitModel.create({
    userId,
    dedupe_key: overrides.dedupe_key ?? computeDedupeKey(jd, company_url),
    jd,
    status: overrides.status ?? "ready",
    source: { company_url },
  });
}

describe("User model", () => {
  it("enforces unique email", async () => {
    await User.create({ email: "a@example.com", passwordHash: "x" });
    await expect(User.create({ email: "a@example.com", passwordHash: "y" })).rejects.toThrow();
  });

  it("lowercases email on save", async () => {
    const user = await User.create({ email: "Mixed@Example.com", passwordHash: "x" });
    expect(user.email).toBe("mixed@example.com");
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the password in plaintext", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toContain("correct-horse-battery-staple");
  });
});

describe("sessions", () => {
  it("creates a session and resolves it back to the correct userId", async () => {
    const userId = await createTestUser("session-user@example.com");
    const { token } = await createSession(userId);
    const resolved = await getSessionUserId(token);
    expect(resolved).toBe(userId);
  });

  it("returns null for a token that doesn't exist", async () => {
    expect(await getSessionUserId("nonexistent-token")).toBeNull();
  });

  it("returns null for an expired session even before the TTL sweep runs", async () => {
    const userId = await createTestUser("expired-user@example.com");
    const { token } = await createSession(userId);
    // Directly backdate expiresAt to simulate an expired-but-not-yet-swept
    // session — this is exactly the case explicit filtering must catch.
    const { Session } = await import("../models/Session.js");
    await Session.updateOne({ token }, { expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionUserId(token)).toBeNull();
  });

  it("invalidates a session on logout", async () => {
    const userId = await createTestUser("logout-user@example.com");
    const { token } = await createSession(userId);
    await deleteSession(token);
    expect(await getSessionUserId(token)).toBeNull();
  });
});

describe("Kit model", () => {
  // Duplicate-submission detection (Section 10) is an application-level
  // check (kitRepository.findExistingKitByDedupeKey, tested below), not a
  // DB-level unique constraint — see the comment on the dedupe_key index
  // in db/models/Kit.ts for why. These tests confirm the model itself
  // doesn't reject a duplicate dedupe_key (that's the app's job).

  it("allows a new attempt with the same dedupe_key if the prior one failed", async () => {
    const userId = await createTestUser("retry-user@example.com");
    await createTestKit(userId, { dedupe_key: "same-key", status: "failed" });
    await expect(createTestKit(userId, { dedupe_key: "same-key", status: "ready" })).resolves.toBeDefined();
  });

  it("allows two different users to use the same dedupe_key", async () => {
    const userA = await createTestUser("user-a@example.com");
    const userB = await createTestUser("user-b@example.com");
    await createTestKit(userA, { dedupe_key: "shared-key" });
    await expect(createTestKit(userB, { dedupe_key: "shared-key" })).resolves.toBeDefined();
  });
});

describe("kitRepository", () => {
  it("getOwnedKit returns the kit when requested by its owner", async () => {
    const userId = await createTestUser("owner@example.com");
    const kit = await createTestKit(userId);
    const found = await getOwnedKit(String(kit._id), userId);
    expect(found).not.toBeNull();
    expect(String(found!._id)).toBe(String(kit._id));
  });

  it("getOwnedKit returns null when requested by a different user (IDOR prevention, AC-018)", async () => {
    const owner = await createTestUser("real-owner@example.com");
    const attacker = await createTestUser("attacker@example.com");
    const kit = await createTestKit(owner);
    const found = await getOwnedKit(String(kit._id), attacker);
    expect(found).toBeNull();
  });

  it("getOwnedKit returns null for a nonexistent kit id, indistinguishable from a wrong-owner result", async () => {
    const userId = await createTestUser("someone@example.com");
    const found = await getOwnedKit("507f1f77bcf86cd799439011", userId);
    expect(found).toBeNull();
  });

  it("findExistingKitByDedupeKey finds a matching non-failed kit for the same user", async () => {
    const userId = await createTestUser("finder@example.com");
    const kit = await createTestKit(userId, { dedupe_key: "find-me" });
    const result = await findExistingKitByDedupeKey(userId, "find-me");
    expect(result.existingKitId).toBe(String(kit._id));
  });

  it("findExistingKitByDedupeKey ignores a failed kit with the same key", async () => {
    const userId = await createTestUser("finder2@example.com");
    await createTestKit(userId, { dedupe_key: "find-me-2", status: "failed" });
    const result = await findExistingKitByDedupeKey(userId, "find-me-2");
    expect(result.existingKitId).toBeNull();
  });
});
