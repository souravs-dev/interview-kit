import { describe, expect, it } from "vitest";
import { crawlCompanySite } from "../crawlCompanySite.js";
import { FakeFetchAdapter } from "../../../adapters/fakes/FakeFetchAdapter.js";

const HOME = "http://localhost:8099/acme/";

function page(html: string) {
  return { url: HOME, status: 200, contentType: "text/html", html };
}

describe("crawlCompanySite", () => {
  it("fetches the homepage and the highest-ranked hiring link", async () => {
    const fetcher = new FakeFetchAdapter()
      .register(
        HOME,
        page(`<html><head><title>Acme</title></head><body>
          <a href="/careers">Careers</a><a href="/pricing">Pricing</a>
        </body></html>`),
      )
      .register("http://localhost:8099/careers", page(`<body>We're hiring!</body>`));

    const result = await crawlCompanySite(HOME, { fetcher });
    expect(result.pagesUsed).toContain(HOME);
    expect(result.pagesUsed).toContain("http://localhost:8099/careers");
    expect(result.pages).toHaveLength(2);
  });

  it("degrades honestly to an empty result when the company URL is unreachable (Section 10)", async () => {
    const fetcher = new FakeFetchAdapter(); // no fixture registered -> fetch throws
    const result = await crawlCompanySite(HOME, { fetcher });
    expect(result.pages).toEqual([]);
    expect(result.pagesUsed).toEqual([]);
  });

  it("skips a candidate link that fails to fetch and continues the crawl (Section 2)", async () => {
    const fetcher = new FakeFetchAdapter()
      .register(
        HOME,
        page(`<body><a href="/careers">Careers</a><a href="/jobs">Jobs</a></body>`),
      )
      .register("http://localhost:8099/jobs", page(`<body>Open roles</body>`));
    // /careers deliberately NOT registered -> its fetch throws and must be skipped, not fatal

    const result = await crawlCompanySite(HOME, { fetcher });
    expect(result.pagesUsed).toContain(HOME);
    expect(result.pagesUsed).toContain("http://localhost:8099/jobs");
    expect(result.pagesUsed).not.toContain("http://localhost:8099/careers");
  });

  it("produces an honest result when the homepage has no discoverable hiring page (Section 10)", async () => {
    const fetcher = new FakeFetchAdapter().register(HOME, page(`<body><a href="/pricing">Pricing</a><a href="/about">About</a></body>`));
    const result = await crawlCompanySite(HOME, { fetcher });
    expect(result.pagesUsed).toEqual([HOME]);
  });

  it("respects the maxPages budget", async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/careers-${i}">Careers ${i}</a>`).join("");
    const fetcher = new FakeFetchAdapter().register(HOME, page(`<body>${links}</body>`));
    for (let i = 0; i < 10; i++) {
      fetcher.register(`http://localhost:8099/careers-${i}`, page(`<body>role ${i}</body>`));
    }
    const result = await crawlCompanySite(HOME, { fetcher }, { maxPages: 3 });
    expect(result.pages.length).toBeLessThanOrEqual(3);
  });
});
