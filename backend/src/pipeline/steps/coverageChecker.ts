import type { Question, Requirement } from "@interview-prep-kit/shared";

export interface CoverageResult {
  /** Every requirement id (must or nice) with no covering question. */
  uncoveredRequirementIds: string[];
  /** Subset of the above that are priority "must" — this is what gates the coverage loop. */
  uncoveredMustHaveIds: string[];
}

/**
 * Deterministically compares extracted requirements against generated
 * questions to find requirements with no covering question. Pure
 * function, no LLM call and no I/O — the assessment brief is explicit
 * that this comparison must be the application's decision, not the
 * model's (RFC-001 section 3.2, step 9).
 */
export function checkCoverage(requirements: Requirement[], questions: Question[]): CoverageResult {
  const coveredIds = new Set<string>();
  for (const question of questions) {
    for (const id of question.requirement_ids) {
      coveredIds.add(id);
    }
  }

  const uncovered = requirements.filter((r) => !coveredIds.has(r.id));

  return {
    uncoveredRequirementIds: uncovered.map((r) => r.id),
    uncoveredMustHaveIds: uncovered.filter((r) => r.priority === "must").map((r) => r.id),
  };
}
