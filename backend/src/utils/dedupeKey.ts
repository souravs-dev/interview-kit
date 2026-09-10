import { createHash } from "node:crypto";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Section 10: detects the same JD + company submitted twice, independent of whitespace/case differences. */
export function computeDedupeKey(jd: string, companyUrl: string): string {
  return createHash("sha256")
    .update(`${normalize(jd)}|${normalize(companyUrl)}`)
    .digest("hex");
}
