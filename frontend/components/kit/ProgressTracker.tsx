import type { JobState } from "@/lib/useKit";

const STEP_LABELS: Record<string, string> = {
  extract_requirements: "Extracting requirements from the job description",
  crawl_company_site: "Crawling the company site",
  search_public_discussion: "Searching for public interview discussion",
  generate_company_brief: "Writing the company brief",
  generate_questions: "Generating interview questions",
  check_coverage: "Checking coverage of every requirement",
  generate_flashcards: "Generating flashcards",
  allocate_schedule: "Building the study schedule",
};

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <span className="text-green-600">✓</span>;
  if (status === "failed") return <span className="text-red-600">✕</span>;
  if (status === "running") return <span className="animate-pulse text-blue-600">●</span>;
  return <span className="text-slate-300">○</span>;
}

export function ProgressTracker({ job }: { job: JobState | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6" role="status" aria-live="polite">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Generating your kit…</h2>
      <ul className="space-y-2">
        {(job?.steps ?? Object.keys(STEP_LABELS).map((name) => ({ name, status: "pending" as const }))).map((step) => (
          <li key={step.name} className="flex items-center gap-2 text-sm">
            <StepIcon status={step.status} />
            <span className={step.status === "done" ? "text-slate-500 line-through" : "text-slate-800"}>{STEP_LABELS[step.name] ?? step.name}</span>
          </li>
        ))}
      </ul>
      {job?.status === "failed" && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Generation failed: {job.error?.message ?? "Unknown error"}
        </p>
      )}
    </div>
  );
}
