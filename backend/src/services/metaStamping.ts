import type { Kit, ItemMeta } from "@interview-prep-kit/shared";

/**
 * The pipeline's output (Appendix A) has no notion of _meta — that's an
 * extension the persistence layer adds on top, since generated/edited/
 * pinned state only matters once a kit is something a user can edit
 * (RFC-001 section 3.3). Called once, right after a successful generation
 * or regeneration, before the kit is saved.
 */
export function stampGeneratedMeta(kit: Kit, generationBatch: string): Kit {
  const now = new Date().toISOString();
  const meta = (order: number): ItemMeta => ({
    source: "generated",
    pinned: false,
    order,
    generatedAt: now,
    editedAt: null,
    generationBatch,
  });

  return {
    ...kit,
    company_brief: { ...kit.company_brief, _meta: meta(0) },
    questions: kit.questions.map((q, i) => ({ ...q, _meta: meta((i + 1) * 1000) })),
    flashcards: kit.flashcards.map((f, i) => ({ ...f, _meta: meta((i + 1) * 1000) })),
    schedule: { ...kit.schedule, _meta: meta(0) },
  };
}
