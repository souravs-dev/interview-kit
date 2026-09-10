import type { PageLink } from "../cleanPage.js";

export interface ScoredLink extends PageLink {
  score: number;
}

/**
 * Strong signal, matched against individual hyphen-split tokens of each
 * path segment — not just whole-segment equality. This is what finds a
 * real hiring page at a multi-word slug like "/eng/blog/how-we-hire"
 * (the brief's own example: GitLab/PostHog publish hiring content at
 * paths a fixed list would never predict), without over-matching, since
 * the "careers-in-real-estate" decoy is discriminated by the date-archive
 * and depth penalties below, not by withholding token-level matching.
 */
const STRONG_PATH_TOKENS = new Set([
  "careers",
  "career",
  "jobs",
  "job",
  "hiring",
  "hire",
  "hires",
  "join",
  "opportunities",
  "positions",
  "openings",
]);

/** Weaker token signal — the brief calls out a handbook by name as an unpredictable place hiring info lives. */
const WEAK_PATH_TOKENS = new Set(["handbook", "team", "life"]);

/** Substring signal on anchor text — weaker evidence than a path-segment match, but catches phrasing like "How We Hire". */
const TEXT_KEYWORDS = ["career", "job", "hire", "hiring", "join us", "join our", "work with us", "life at", "open position", "open role"];

function isDateLikeSegment(segment: string): boolean {
  return /^\d{4}$/.test(segment) || /^\d{1,2}$/.test(segment);
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
}

function pathTokens(segments: string[]): string[] {
  return segments.flatMap((s) => s.split("-"));
}

function scoreLink(resolved: URL, anchorText: string): number {
  const segments = pathSegments(resolved);
  const tokens = pathTokens(segments);
  const anchorLower = anchorText.toLowerCase();
  let score = 0;

  if (tokens.some((t) => STRONG_PATH_TOKENS.has(t))) score += 5;
  else if (tokens.some((t) => WEAK_PATH_TOKENS.has(t))) score += 2;

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
