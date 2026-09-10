import { describe, expect, it } from "vitest";
import { CaseInputFile, CaseOutputFile } from "../case.js";
import { buildValidKitFixture } from "../../testing/fixtures.js";

describe("CaseInputFile (Appendix B input)", () => {
  it("accepts the documented shape", () => {
    const result = CaseInputFile.safeParse([
      {
        id: "case-01",
        jd: "Senior Backend Engineer\n\nWe are looking for ...",
        company_url: "http://localhost:8099/acme/",
        days: 5,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a case missing company_url", () => {
    const result = CaseInputFile.safeParse([{ id: "case-01", jd: "text", days: 5 }]);
    expect(result.success).toBe(false);
  });
});

describe("CaseOutputFile (Appendix B output)", () => {
  it("accepts an ok case with a valid kit", () => {
    const result = CaseOutputFile.safeParse({
      version: "1.0",
      generated_at: "2026-09-01T09:12:44Z",
      kits: [{ id: "case-01", status: "ok", kit: buildValidKitFixture(), error: null }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a failed case with a structured error and null kit", () => {
    const result = CaseOutputFile.safeParse({
      version: "1.0",
      generated_at: "2026-09-01T09:12:44Z",
      kits: [
        {
          id: "case-04",
          status: "failed",
          kit: null,
          error: { code: "COMPANY_UNREACHABLE", message: "Company site unreachable after 3 retries." },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an ok case with a null kit", () => {
    const result = CaseOutputFile.safeParse({
      version: "1.0",
      generated_at: "2026-09-01T09:12:44Z",
      kits: [{ id: "case-01", status: "ok", kit: null, error: null }],
    });
    expect(result.success).toBe(false);
  });
});
