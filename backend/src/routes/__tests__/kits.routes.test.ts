import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestDb, stopTestDb, clearTestDb } from "../../db/__tests__/testDb.js";
import { buildTestApp, ORIGIN_HEADER, waitForJob, type TestApp } from "./testApp.js";

beforeAll(async () => {
  await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

const COMPANY_URL = "http://localhost:8099/acme/";

function homepagePage() {
  return { url: COMPANY_URL, status: 200, contentType: "text/html", html: "<html><head><title>Acme</title></head><body>We build tools.</body></html>" };
}

/** Enqueues one happy-path kit generation's worth of LLM responses in the exact call order buildKit produces. */
function enqueueHappyPathGeneration(testApp: TestApp) {
  testApp.fetcher.register(COMPANY_URL, homepagePage());
  testApp.llm
    .enqueueJson({
      role: { title: "Backend Engineer", seniority: "Mid", location: "Remote", responsibilities: ["Build services"] },
      requirements: [{ text: "5+ years with Node.js", kind: "technical", priority: "must" }],
    })
    .enqueueJson({ summary: "Acme builds developer tools.", what_they_do: "Developer tooling." })
    .enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "Explain event loop.", answer_outline: "...", difficulty: 2 }] })
    .enqueueJson({ questions: [] })
    .enqueueJson({ flashcards: [{ front: "What is the event loop?", back: "...", requirement_ids: ["r1"] }] });
}

async function registerAndGetCookie(app: TestApp["app"], email: string): Promise<string> {
  const res = await request(app).post("/api/auth/register").set(ORIGIN_HEADER).send({ email, password: "correct-horse" });
  return res.headers["set-cookie"]![0]!;
}

async function createReadyKit(testApp: TestApp, cookie: string): Promise<string> {
  enqueueHappyPathGeneration(testApp);
  const createRes = await request(testApp.app)
    .post("/api/kits")
    .set(ORIGIN_HEADER)
    .set("Cookie", cookie)
    .send({ jd: "Backend Engineer, 5+ years Node.js required.", company_url: COMPANY_URL, days: 3 });
  expect(createRes.status).toBe(202);
  await waitForJob(request(testApp.app), cookie, createRes.body.job_id);
  return createRes.body.kit_id as string;
}

describe("kit creation + job polling", () => {
  it("creates a kit and the job reaches done with a valid kit", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "gen@example.com");
    const kitId = await createReadyKit(testApp, cookie);

    const getRes = await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.kit.status).toBe("ready");
    expect(getRes.body.kit.questions.length).toBeGreaterThan(0);
    expect(getRes.body.kit.questions[0]._meta.source).toBe("generated");
  });

  it("rejects an unauthenticated kit creation request", async () => {
    const testApp = buildTestApp();
    const res = await request(testApp.app).post("/api/kits").set(ORIGIN_HEADER).send({ jd: "x", company_url: COMPANY_URL, days: 1 });
    expect(res.status).toBe(401);
  });

  it("detects a duplicate JD+company submission (AC-022)", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "dup@example.com");
    await createReadyKit(testApp, cookie);

    const dupRes = await request(testApp.app)
      .post("/api/kits")
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ jd: "Backend Engineer, 5+ years Node.js required.", company_url: COMPANY_URL, days: 3 });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe("DUPLICATE_KIT");
  });

  it("allows force:true to bypass duplicate detection", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "force@example.com");
    await createReadyKit(testApp, cookie);

    enqueueHappyPathGeneration(testApp);
    const res = await request(testApp.app)
      .post("/api/kits")
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ jd: "Backend Engineer, 5+ years Node.js required.", company_url: COMPANY_URL, days: 3, force: true });
    expect(res.status).toBe(202);
  });
});

describe("kit CRUD + ownership", () => {
  it("returns 404 when a different user requests someone else's kit (IDOR prevention, AC-018)", async () => {
    const testApp = buildTestApp();
    const ownerCookie = await registerAndGetCookie(testApp.app, "owner@example.com");
    const kitId = await createReadyKit(testApp, ownerCookie);

    const attackerCookie = await registerAndGetCookie(testApp.app, "attacker@example.com");
    const res = await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", attackerCookie);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent kit id, identical in shape to a wrong-owner result", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "someone@example.com");
    const res = await request(testApp.app).get("/api/kits/507f1f77bcf86cd799439011").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("lists only the requesting user's kits", async () => {
    const testApp = buildTestApp();
    const cookieA = await registerAndGetCookie(testApp.app, "listA@example.com");
    await createReadyKit(testApp, cookieA);
    const cookieB = await registerAndGetCookie(testApp.app, "listB@example.com");

    const resA = await request(testApp.app).get("/api/kits").set("Cookie", cookieA);
    const resB = await request(testApp.app).get("/api/kits").set("Cookie", cookieB);
    expect(resA.body.kits).toHaveLength(1);
    expect(resB.body.kits).toHaveLength(0);
  });

  it("deletes a kit owned by the requester", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "delete@example.com");
    const kitId = await createReadyKit(testApp, cookie);
    const deleteRes = await request(testApp.app).delete(`/api/kits/${kitId}`).set(ORIGIN_HEADER).set("Cookie", cookie);
    expect(deleteRes.status).toBe(204);
    const getRes = await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie);
    expect(getRes.status).toBe(404);
  });

  it("prevents deleting another user's kit", async () => {
    const testApp = buildTestApp();
    const ownerCookie = await registerAndGetCookie(testApp.app, "owner2@example.com");
    const kitId = await createReadyKit(testApp, ownerCookie);
    const attackerCookie = await registerAndGetCookie(testApp.app, "attacker2@example.com");
    const res = await request(testApp.app).delete(`/api/kits/${kitId}`).set(ORIGIN_HEADER).set("Cookie", attackerCookie);
    expect(res.status).toBe(404);
  });
});

describe("builder mutations", () => {
  it("edits a question and marks its _meta.source as edited", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "edit@example.com");
    const kitId = await createReadyKit(testApp, cookie);
    const kit = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    const questionId = kit.questions[0].id;

    const res = await request(testApp.app)
      .patch(`/api/kits/${kitId}/questions/${questionId}`)
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ prompt: "My hand-edited prompt" });
    expect(res.status).toBe(200);
    expect(res.body.question.prompt).toBe("My hand-edited prompt");
    expect(res.body.question._meta.source).toBe("edited");
  });

  it("adds a user-authored question and recomputes coverage", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "add@example.com");
    const kitId = await createReadyKit(testApp, cookie);

    const res = await request(testApp.app)
      .post(`/api/kits/${kitId}/questions`)
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ category: "technical", prompt: "Custom question", answer_outline: "outline", requirement_ids: ["r1"], difficulty: 1 });
    expect(res.status).toBe(201);
    expect(res.body.question._meta.source).toBe("user_added");
  });

  it("deletes a question and recomputes coverage as a gap", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "delq@example.com");
    const kitId = await createReadyKit(testApp, cookie);
    const kit = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    const questionId = kit.questions[0].id;

    const res = await request(testApp.app).delete(`/api/kits/${kitId}/questions/${questionId}`).set(ORIGIN_HEADER).set("Cookie", cookie);
    expect(res.status).toBe(204);
    const after = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    expect(after.coverage.uncovered_requirement_ids).toContain("r1");
  });

  it("regenerating a category preserves a hand-edited question in that same category (AC-011)", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "regen@example.com");
    const kitId = await createReadyKit(testApp, cookie);
    const kit = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    const technicalQuestion = kit.questions.find((q: { category: string }) => q.category === "technical");

    // Pin the technical question so it survives even within its own category's regen.
    await request(testApp.app).post(`/api/kits/${kitId}/questions/${technicalQuestion.id}/pin`).set(ORIGIN_HEADER).set("Cookie", cookie).send({ pinned: true });

    testApp.llm.enqueueJson({ questions: [{ requirement_ids: ["r1"], prompt: "A brand new question", answer_outline: "...", difficulty: 1 }] });
    const regenRes = await request(testApp.app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ section: "questions:technical" });
    expect(regenRes.status).toBe(202);
    await waitForJob(request(testApp.app), cookie, regenRes.body.job_id);

    const after = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    const stillThere = after.questions.find((q: { id: string }) => q.id === technicalQuestion.id);
    expect(stillThere).toBeDefined();
    expect(stillThere.prompt).toBe(technicalQuestion.prompt);
  });
});

describe("practice mode", () => {
  it("records confidence on a flashcard and orders the practice session by least-confident first", async () => {
    const testApp = buildTestApp();
    const cookie = await registerAndGetCookie(testApp.app, "practice@example.com");
    const kitId = await createReadyKit(testApp, cookie);
    const kit = (await request(testApp.app).get(`/api/kits/${kitId}`).set("Cookie", cookie)).body.kit;
    const flashcardId = kit.flashcards[0].id;

    const confidenceRes = await request(testApp.app)
      .post(`/api/kits/${kitId}/flashcards/${flashcardId}/confidence`)
      .set(ORIGIN_HEADER)
      .set("Cookie", cookie)
      .send({ confidence: 5 });
    expect(confidenceRes.status).toBe(200);
    expect(confidenceRes.body.flashcard.practice.timesReviewed).toBe(1);

    const sessionRes = await request(testApp.app).get(`/api/kits/${kitId}/practice/session`).set("Cookie", cookie);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.coverage.reviewed).toBe(1);
  });
});
