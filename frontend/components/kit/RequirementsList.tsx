import type { Requirement } from "@interview-prep-kit/shared";

export function RequirementsList({ requirements, uncoveredIds }: { requirements: Requirement[]; uncoveredIds: string[] }) {
  if (requirements.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Requirements</h2>
        <p className="text-sm text-slate-400">The job description didn&apos;t contain enough to extract specific requirements from.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Requirements</h2>
      <ul className="space-y-1.5">
        {requirements.map((r) => {
          const uncovered = uncoveredIds.includes(r.id);
          return (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.priority === "must" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>
                {r.priority}
              </span>
              <span className="text-slate-800">{r.text}</span>
              {uncovered && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="No question currently covers this requirement">
                  not yet covered
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
