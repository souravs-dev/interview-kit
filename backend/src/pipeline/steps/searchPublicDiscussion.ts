import type { CleanedPage } from "../cleanPage.js";
import type { PipelineDeps } from "../types.js";
import { fetchPage } from "./fetchPage.js";

export interface DiscussionResult {
  pages: CleanedPage[];
  sources: string[];
}

const DEFAULT_MAX_RESULTS = 3;

/**
 * Step 6 (RFC-001 section 3.2). A search failure (DuckDuckGo blocked/
 * markup changed) and a genuinely empty result set are deliberately
 * indistinguishable to the caller — both collapse to the same honest
 * "no public discussion found" outcome (Section 10), never a fatal error
 * for the whole kit build.
 */
export async function searchPublicDiscussion(
  companyName: string,
  deps: Pick<PipelineDeps, "search" | "fetcher">,
  options: { maxResults?: number } = {},
): Promise<DiscussionResult> {
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

  if (!companyName.trim()) {
    return { pages: [], sources: [] };
  }

  let results;
  try {
    results = await deps.search.search(`${companyName} interview process questions`);
  } catch {
    return { pages: [], sources: [] };
  }

  const pages: CleanedPage[] = [];
  const sources: string[] = [];

  for (const result of results.slice(0, maxResults)) {
    try {
      const page = await fetchPage(result.url, deps);
      pages.push(page);
      sources.push(result.url);
    } catch {
      continue; // skip and report — Section 2
    }
  }

  return { pages, sources };
}
