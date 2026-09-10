import type { CleanedPage } from "../cleanPage.js";
import type { PipelineDeps } from "../types.js";
import { fetchPage } from "./fetchPage.js";
import { rankLinks } from "./rankLinks.js";

export interface CrawlResult {
  pages: CleanedPage[];
  pagesUsed: string[];
}

const DEFAULT_MAX_PAGES = 5;
const MIN_RANKED_SCORE = 0;

/**
 * Steps 2-4 of the pipeline (RFC-001 section 3.2): fetch the homepage,
 * rank its outbound links, and fetch whatever scores well enough to be
 * worth it. Never throws — an unreachable company URL (Section 10)
 * degrades to an empty result so the rest of the kit can still be built
 * honestly from the JD alone; a link that fails to fetch is skipped and
 * the crawl continues (Section 2: "skip and report a source that cannot
 * be retrieved, rather than failing the whole run").
 */
export async function crawlCompanySite(
  companyUrl: string,
  deps: Pick<PipelineDeps, "fetcher">,
  options: { maxPages?: number } = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  let homepage: CleanedPage;
  try {
    homepage = await fetchPage(companyUrl, deps);
  } catch {
    return { pages: [], pagesUsed: [] };
  }

  const pages: CleanedPage[] = [homepage];
  const pagesUsed: string[] = [companyUrl];

  const ranked = rankLinks(homepage.links, companyUrl).filter((l) => l.score > MIN_RANKED_SCORE);
  const candidates = ranked.slice(0, Math.max(0, maxPages - 1));

  for (const candidate of candidates) {
    if (pagesUsed.includes(candidate.href)) continue;
    try {
      const page = await fetchPage(candidate.href, deps);
      pages.push(page);
      pagesUsed.push(candidate.href);
    } catch {
      continue;
    }
  }

  return { pages, pagesUsed };
}
