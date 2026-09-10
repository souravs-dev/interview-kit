/**
 * Best-effort company name: prefer the homepage's <title>, falling back
 * to a capitalized hostname when no title was retrievable (e.g. the
 * company site was entirely unreachable). Deliberately not an LLM call —
 * cheap, deterministic, and good enough for `source.company`.
 */
export function deriveCompanyName(homepageTitle: string | undefined, companyUrl: string): string {
  const cleanedTitle = (homepageTitle ?? "").split(/[|\-–—]/)[0]?.trim();
  if (cleanedTitle) return cleanedTitle;

  try {
    const hostname = new URL(companyUrl).hostname.replace(/^www\./, "");
    const base = hostname.split(".")[0] ?? hostname;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "";
  }
}
