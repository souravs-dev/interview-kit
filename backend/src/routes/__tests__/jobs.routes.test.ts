import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestDb, stopTestDb, clearTestDb } from "../../db/__tests__/testDb.js";
import { buildTestApp, ORIGIN_HEADER } from "./testApp.js";

beforeAll(async () => {
  await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

async function registerAndGetCookie(app: Parameters<typeof request>[0], email: string): Promise<string> {
  const res = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email, password: "correct-horse" });
  return res.headers["set-cookie"]![0]!;
}

describe("jobs route", () => {
  it("returns 404 for a nonexistent but well-formed job id", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "job-missing@example.com");
    const res = await request(testApp.app).get("/api/jobs/507f1f77bcf86cd799439011").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("returns 404 (not a 500) for a malformed job id instead of letting it hit Mongoose as a raw CastError", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "job-malformed@example.com");
    const res = await request(testApp.app).get("/api/jobs/not-a-valid-object-id").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});
