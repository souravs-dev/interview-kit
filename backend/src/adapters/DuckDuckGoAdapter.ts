import * as cheerio from "cheerio";
import type { SearchAdapter, SearchResult } from "../pipeline/types.js";
import { withRetry } from "./withRetry.js";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const TIMEOUT_MS = 10_000;

/** DuckDuckGo's HTML results wrap the real URL behind a redirect: //duckduckgo.com/l/?uddg=<encoded>&... */
export function extractRealUrl(ddgHref: string): string | null {
  try {
    const url = new URL(ddgHref, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return null;
  }
}

/** Pure HTML-parsing logic, separated from the network call so it's unit-testable against a static fixture. */
export function parseResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    const titleEl = $(el).find(".result__a").first();
    const title = titleEl.text().trim();
    const rawHref = titleEl.attr("href");
    const snippet = $(el).find(".result__snippet").first().text().trim();
    if (!title || !rawHref) return;
    const url = extractRealUrl(rawHref);
    if (url) results.push({ title, url, snippet });
  });

  return results;
}

export class DuckDuckGoAdapter implements SearchAdapter {
  async search(query: string): Promise<SearchResult[]> {
    return withRetry(
      async () => {
        const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; InterviewPrepKit/1.0)" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`DuckDuckGo search failed with status ${response.status}`);
        }
        return parseResults(await response.text());
      },
      { maxAttempts: 2 },
    );
  }
}
