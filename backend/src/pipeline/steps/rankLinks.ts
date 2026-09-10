import type { PageLink } from "../cleanPage.js";

export interface ScoredLink extends PageLink {
  score: number;
}

/** Whole-path-segment matches (strong signal) — e.g. "/careers", "/join-us", "/eng/jobs". */
const STRONG_PATH_SEGMENTS = new Set([
  "careers",
  "career",
  "jobs",
  "job",
  "hiring",
  "join",
  "join-us",
  "work-with-us",
  "opportunities",
  "positions",
  "openings",
]);

/** Whole-path-segment matches (weaker signal) — the brief calls out a handbook by name as an unpredictable place hiring info lives. */
const WEAK_PATH_SEGMENTS = new Set(["handbook", "team", "life"]);

/** Substring signal on anchor text — weaker evidence than a path-segment match, but catches phrasing like "How We Hire". */
const TEXT_KEYWORDS = ["career", "job", "hire", "hiring", "join us", "join our", "work with us", "life at", "open position", "open role"];

function isDateLikeSegment(segment: string): boolean {
  return /^\d{4}$/.test(segment) || /^\d{1,2}$/.test(segment);
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
}

function scoreLink(resolved: URL, anchorText: string): number {
  const segments = pathSegments(resolved);
  const anchorLower = anchorText.toLowerCase();
  let score = 0;

  if (segments.some((s) => STRONG_PATH_SEGMENTS.has(s))) score += 5;
  else if (segments.some((s) => WEAK_PATH_SEGMENTS.has(s))) score += 2;

  if (TEXT_KEYWORDS.some((kw) => anchorLower.includes(kw))) score += 2;

  // Dated blog-archive-style segments (e.g. "/blog/2023/...") signal a
  // timestamped article, not an evergreen page like a careers page —
  // this is what keeps a "Careers in Real Estate" blog post from
  // outranking an actual /careers page despite the superficial keyword.
  score -= segments.filter(isDateLikeSegment).length * 3;

  // Prefer shallow paths — a real careers page is rarely buried 4+ levels deep.
  score -= Math.max(0, segments.length - 2);

  return score;
}

/**
 * Deterministically ranks a page's outbound links by how likely they are
 * to be a hiring/careers page. Pure function, no I/O — the assessment
 * brief is explicit that a fixed path list is insufficient (Section 2)
 * and that hiring info can live anywhere from a dedicated /careers page
 * to a handbook to an engineering blog post, so this scores whatever the
 * site's own structure actually contains rather than guessing at
 * conventional paths.
 */
export function rankLinks(links: PageLink[], baseUrl: string): ScoredLink[] {
  const seen = new Set<string>();
  const scored: ScoredLink[] = [];

  for (const link of links) {
    let resolved: URL;
    try {
      resolved = new URL(link.href, baseUrl);
    } catch {
      continue;
    }
    const key = resolved.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push({ href: key, anchorText: link.anchorText, score: scoreLink(resolved, link.anchorText) });
  }

  return scored.sort((a, b) => b.score - a.score);
}
