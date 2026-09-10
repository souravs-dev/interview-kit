"use client";

import Link from "next/link";
import type { QuestionCategory } from "@interview-prep-kit/shared";
import { useKit } from "@/lib/useKit";
import { ProgressTracker } from "./ProgressTracker";
import { CompanyBrief } from "./CompanyBrief";
import { RequirementsList } from "./RequirementsList";
import { QuestionCategoryPanel } from "./QuestionCategoryPanel";
import { FlashcardPanel } from "./FlashcardPanel";
import { ScheduleView } from "./ScheduleView";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];

export function KitBuilder({ kitId }: { kitId: string }) {
  const { kit, job, loading, error, reload, trackJob } = useKit(kitId);

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-400">Loading kit…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-red-600" role="alert">
        {error}
      </div>
    );
  }

  if (!kit) return null;

  const isGenerating = kit.status === "queued" || kit.status === "generating" || (job && job.status === "running");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {kit.role.title || "Untitled role"} <span className="text-slate-400">at</span> {kit.source.company || "Unknown company"}
        </h1>
        {kit.status === "ready" && (
          <Link href={`/kits/${kitId}/practice`} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Practice mode
          </Link>
        )}
      </div>

      {isGenerating && <ProgressTracker job={job} />}

      {kit.status === "failed" && !isGenerating && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Generation failed for this kit.
        </p>
      )}

      {kit.status === "ready" && (
        <>
          <CompanyBrief kitId={kitId} companyBrief={kit.company_brief} company={kit.source.company} onRegenerate={trackJob} onChanged={reload} />
          <RequirementsList requirements={kit.role.requirements} uncoveredIds={kit.coverage.uncovered_requirement_ids} />

          <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Questions</h2>
            {CATEGORIES.map((category) => (
              <QuestionCategoryPanel
                key={category}
                kitId={kitId}
                category={category}
                questions={kit.questions.filter((q) => q.category === category).sort((a, b) => (a._meta?.order ?? 0) - (b._meta?.order ?? 0))}
                onRegenerate={trackJob}
                onChanged={reload}
              />
            ))}
          </section>

          <FlashcardPanel kitId={kitId} flashcards={kit.flashcards} onRegenerate={trackJob} onChanged={reload} />
          <ScheduleView kitId={kitId} schedule={kit.schedule} questions={kit.questions} onRegenerate={trackJob} />
        </>
      )}
    </div>
  );
}
