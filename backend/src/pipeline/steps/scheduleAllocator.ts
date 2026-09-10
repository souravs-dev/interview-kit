import type { Question, Requirement, Schedule } from "@interview-prep-kit/shared";

const MINUTES_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 20, 2: 30, 3: 45 };
const REVIEW_DAY_MINUTES = 20;
const REVIEW_DAY_FOCUS = "Review & light practice";

interface ScoredQuestion {
  question: Question;
  score: number;
}

/** Higher score = higher priority = scheduled earlier. Must-have coverage dominates difficulty. */
function scoreQuestion(question: Question, mustHaveIds: Set<string>): number {
  const coversMustHave = question.requirement_ids.some((id) => mustHaveIds.has(id));
  return (coversMustHave ? 10 : 0) + question.difficulty;
}

function dominantCategory(questions: Question[]): string {
  if (questions.length === 0) return REVIEW_DAY_FOCUS;
  const counts = new Map<string, number>();
  for (const q of questions) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  let best: string = questions[0]!.category;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  const label = best.charAt(0).toUpperCase() + best.slice(1).replace("-", " ");
  return `${label} questions`;
}

function minutesForDay(questions: Question[]): number {
  if (questions.length === 0) return REVIEW_DAY_MINUTES;
  return questions.reduce((sum, q) => sum + MINUTES_BY_DIFFICULTY[q.difficulty], 0);
}

/**
 * Deterministically allocates every given question across exactly
 * `daysAvailable` days — arithmetic, not an LLM call, per the assessment
 * brief (RFC-001 section 3.2, step 10). Never drops a question: any
 * requirement covered by an input question is therefore guaranteed to
 * appear somewhere in the resulting schedule, since scheduling runs after
 * the coverage loop has already ensured every must-have has a question.
 *
 * Higher-scored (must-have-covering, harder) questions are front-loaded
 * into earlier days. When there are more days than questions, the
 * schedule still spans exactly `daysAvailable` entries — trailing days
 * become light review days rather than being omitted or the schedule
 * being silently capped short.
 */
export function allocateSchedule(questions: Question[], requirements: Requirement[], daysAvailable: number): Schedule {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) {
    throw new Error(`daysAvailable must be a positive integer, got ${daysAvailable}`);
  }

  const mustHaveIds = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));
  const scored: ScoredQuestion[] = questions.map((question) => ({
    question,
    score: scoreQuestion(question, mustHaveIds),
  }));

  // Stable, deterministic sort: descending score, ties broken by id so the
  // same input always produces the same schedule.
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.question.id.localeCompare(b.question.id)));
  const sorted = scored.map((s) => s.question);

  const days: Schedule["days"] = [];

  if (sorted.length === 0) {
    for (let day = 1; day <= daysAvailable; day++) {
      days.push({ day, focus: REVIEW_DAY_FOCUS, question_ids: [], minutes: REVIEW_DAY_MINUTES });
    }
    return { days_available: daysAvailable, days };
  }

  if (sorted.length >= daysAvailable) {
    // Chunk into `daysAvailable` contiguous blocks in priority order.
    // Earlier days absorb the remainder so front-loading stays exact.
    const baseSize = Math.floor(sorted.length / daysAvailable);
    const remainder = sorted.length % daysAvailable;
    let cursor = 0;
    for (let day = 1; day <= daysAvailable; day++) {
      const size = baseSize + (day <= remainder ? 1 : 0);
      const chunk = sorted.slice(cursor, cursor + size);
      cursor += size;
      days.push({ day, focus: dominantCategory(chunk), question_ids: chunk.map((q) => q.id), minutes: minutesForDay(chunk) });
    }
  } else {
    // Fewer questions than days: highest-priority questions claim the
    // earliest days one-per-day, remaining days become review days.
    for (let day = 1; day <= daysAvailable; day++) {
      const question = sorted[day - 1];
      if (question) {
        days.push({ day, focus: dominantCategory([question]), question_ids: [question.id], minutes: minutesForDay([question]) });
      } else {
        days.push({ day, focus: REVIEW_DAY_FOCUS, question_ids: [], minutes: REVIEW_DAY_MINUTES });
      }
    }
  }

  return { days_available: daysAvailable, days };
}
