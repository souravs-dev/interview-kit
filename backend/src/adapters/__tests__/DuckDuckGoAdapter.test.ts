import { describe, expect, it } from "vitest";
import { extractRealUrl, parseResults } from "../DuckDuckGoAdapter.js";

const SAMPLE_HTML = `
<div class="results">
  <div class="result results_links results_links_deep web-result">
    <div class="result__body">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fforum.example.com%2Facme%2Dinterview&amp;rut=abc">
        Acme interview experience — Forum
      </a>
      <a class="result__snippet">They ask a take-home followed by a system design round.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="result__body">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblind.example.com%2Facme&amp;rut=def">
        Acme reviews — Blind
      </a>
      <a class="result__snippet">Mixed reviews on the process.</a>
    </div>
  </div>
</div>
`;

describe("extractRealUrl", () => {
  it("decodes the uddg redirect param to the real target URL", () => {
    const result = extractRealUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fforum.example.com%2Facme&rut=abc");
    expect(result).toBe("https://forum.example.com/acme");
  });

  it("returns the href as-is when there is no uddg param", () => {
    const result = extractRealUrl("https://duckduckgo.com/some/path");
    expect(result).toBe("https://duckduckgo.com/some/path");
  });

});

describe("parseResults", () => {
  it("extracts title, real url, and snippet from DuckDuckGo's HTML result markup", () => {
    const results = parseResults(SAMPLE_HTML);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Acme interview experience — Forum",
      url: "https://forum.example.com/acme-interview",
      snippet: "They ask a take-home followed by a system design round.",
    });
    expect(results[1]!.url).toBe("https://blind.example.com/acme");
  });

  it("returns an empty array for a page with no results (Section 10: nothing found)", () => {
    expect(parseResults("<div class='no-results'>No results.</div>")).toEqual([]);
  });

  it("does not throw on malformed/unexpected HTML (bot-block page)", () => {
    expect(() => parseResults("<html><body>Please verify you are human.</body></html>")).not.toThrow();
    expect(parseResults("<html><body>Please verify you are human.</body></html>")).toEqual([]);
  });
});
