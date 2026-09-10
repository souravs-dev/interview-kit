import { describe, expect, it } from "vitest";
import { searchPublicDiscussion } from "../searchPublicDiscussion.js";
import { FakeSearchAdapter } from "../../../adapters/fakes/FakeSearchAdapter.js";
import { FakeFetchAdapter } from "../../../adapters/fakes/FakeFetchAdapter.js";

describe("searchPublicDiscussion", () => {
  it("fetches and cleans the top search results", async () => {
    const search = new FakeSearchAdapter().register("Acme interview process questions", [
      { title: "Acme interview experience", url: "http://forum.example.com/acme-interview", snippet: "..." },
    ]);
    const fetcher = new FakeFetchAdapter().register("http://forum.example.com/acme-interview", {
      url: "http://forum.example.com/acme-interview",
      status: 200,
      contentType: "text/html",
      html: "<body>They ask a take-home followed by a system design round.</body>",
    });
    const result = await searchPublicDiscussion("Acme", { search, fetcher });
    expect(result.sources).toEqual(["http://forum.example.com/acme-interview"]);
    expect(result.pages[0]!.text).toContain("take-home");
  });

  it("treats zero search results as honest 'nothing found' (Section 10)", async () => {
    const search = new FakeSearchAdapter(); // unregistered query -> empty by default
    const fetcher = new FakeFetchAdapter();
    const result = await searchPublicDiscussion("ObscureCo", { search, fetcher });
    expect(result).toEqual({ pages: [], sources: [] });
  });

  it("treats a search-adapter failure identically to zero results, not as a fatal error", async () => {
    const search = new FakeSearchAdapter().register("Acme interview process questions", new Error("DuckDuckGo blocked us"));
    const fetcher = new FakeFetchAdapter();
    const result = await searchPublicDiscussion("Acme", { search, fetcher });
    expect(result).toEqual({ pages: [], sources: [] });
  });

  it("skips a result whose page fetch fails and continues with the rest", async () => {
    const search = new FakeSearchAdapter().register("Acme interview process questions", [
      { title: "dead link", url: "http://dead.example.com/x", snippet: "" },
      { title: "live link", url: "http://live.example.com/y", snippet: "" },
    ]);
    const fetcher = new FakeFetchAdapter().register("http://live.example.com/y", {
      url: "http://live.example.com/y",
      status: 200,
      contentType: "text/html",
      html: "<body>discussion</body>",
    });
    const result = await searchPublicDiscussion("Acme", { search, fetcher });
    expect(result.sources).toEqual(["http://live.example.com/y"]);
  });

  it("respects the maxResults budget", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `http://x.example.com/${i}`);
    const search = new FakeSearchAdapter().register(
      "Acme interview process questions",
      urls.map((url) => ({ title: url, url, snippet: "" })),
    );
    const fetcher = new FakeFetchAdapter();
    for (const url of urls) fetcher.register(url, { url, status: 200, contentType: "text/html", html: "<body>x</body>" });
    const result = await searchPublicDiscussion("Acme", { search, fetcher }, { maxResults: 2 });
    expect(result.sources).toHaveLength(2);
  });

  it("skips the search entirely for an empty company name", async () => {
    const search = new FakeSearchAdapter();
    const fetcher = new FakeFetchAdapter();
    const result = await searchPublicDiscussion("", { search, fetcher });
    expect(result).toEqual({ pages: [], sources: [] });
    expect(search.callLog).toEqual([]);
  });
});
