import { cleanPage, type CleanedPage } from "../cleanPage.js";
import type { PipelineDeps } from "../types.js";

/**
 * Fetches and cleans a single URL. Reused by both company-site crawling
 * and discussion-search result retrieval (RFC-001 section 3.2, step 2) —
 * one implementation, not duplicated per caller. SSRF validation lives in
 * the concrete FetchAdapter (M5), not here, so this step stays a thin,
 * fully fake-able composition.
 */
export async function fetchPage(url: string, deps: Pick<PipelineDeps, "fetcher">): Promise<CleanedPage> {
  const page = await deps.fetcher.fetch(url);
  return cleanPage(page);
}

export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
