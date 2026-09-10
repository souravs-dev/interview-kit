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

describe("auth routes", () => {
  it("registers a new user and sets a session cookie", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "a@example.com", password: "correct-horse" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("a@example.com");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects registration with a too-short password", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "a@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email registration", async () => {
    const { app } = buildTestApp();
    await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "dup@example.com", password: "correct-horse" });
    const res = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "dup@example.com", password: "another-pass" });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const { app } = buildTestApp();
    await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "b@example.com", password: "correct-horse" });
    const res = await request(app).post("/api/auth/login").set(ORIGIN_HEADER).send({ email: "b@example.com", password: "correct-horse" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("b@example.com");
  });

  it("rejects login with a wrong password using a generic error (no user enumeration)", async () => {
    const { app } = buildTestApp();
    await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "c@example.com", password: "correct-horse" });
    const wrongPassword = await request(app).post("/api/auth/login").set(ORIGIN_HEADER).send({ email: "c@example.com", password: "wrong-pass" });
    const noSuchUser = await request(app).post("/api/auth/login").set(ORIGIN_HEADER).send({ email: "nobody@example.com", password: "wrong-pass" });
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
  });

  it("rejects an unauthenticated request to a protected route (AC-017)", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/kits");
    expect(res.status).toBe(401);
  });

  it("GET /session returns the current user when authenticated", async () => {
    const { app } = buildTestApp();
    const registerRes = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "d@example.com", password: "correct-horse" });
    const cookie = registerRes.headers["set-cookie"]![0]!;
    const res = await request(app).get("/api/auth/session").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("d@example.com");
  });

  it("logout invalidates the session", async () => {
    const { app } = buildTestApp();
    const registerRes = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email: "e@example.com", password: "correct-horse" });
    const cookie = registerRes.headers["set-cookie"]![0]!;
    await request(app).post("/api/auth/logout").set(ORIGIN_HEADER).set("Cookie", cookie);
    const res = await request(app).get("/api/auth/session").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("rejects a mutating request with a mismatched Origin header (CSRF check)", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/auth/register").set("Origin", "http://evil.example.com").send({ email: "f@example.com", password: "correct-horse" });
    expect(res.status).toBe(403);
  });
});
