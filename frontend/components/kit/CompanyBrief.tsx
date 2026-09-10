"use client";

import { useState } from "react";
import type { CompanyBrief as CompanyBriefType } from "@interview-prep-kit/shared";
import { api } from "@/lib/apiClient";

export function CompanyBrief({ kitId, companyBrief, company, onRegenerate, onChanged }: { kitId: string; companyBrief: CompanyBriefType; company: string; onRegenerate: (jobId: string) => void; onChanged: () => void }) {
  const [summary, setSummary] = useState(companyBrief.summary);
  const [whatTheyDo, setWhatTheyDo] = useState(companyBrief.what_they_do);

  async function handleBlur(patch: { summary?: string; what_they_do?: string }) {
    await api.patch(`/api/kits/${kitId}/company_brief`, patch);
    onChanged();
  }

  async function handleRegenerate() {
    const { job_id } = await api.post<{ job_id: string }>(`/api/kits/${kitId}/regenerate`, { section: "company_brief" });
    onRegenerate(job_id);
  }

  const isThin = !summary && !whatTheyDo && companyBrief.sources.length === 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company brief — {company || "Unknown company"}</h2>
        <button onClick={handleRegenerate} className="text-xs text-slate-600 underline hover:text-slate-900">
          Regenerate
        </button>
      </div>
      {isThin ? (
        <p className="text-sm text-slate-400">
          Nothing could be found about this company — the site may have been unreachable or had no useful pages. This is reported honestly rather
          than invented.
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== companyBrief.summary && handleBlur({ summary })}
            rows={2}
            className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none"
          />
          <textarea
            value={whatTheyDo}
            onChange={(e) => setWhatTheyDo(e.target.value)}
            onBlur={() => whatTheyDo !== companyBrief.what_they_do && handleBlur({ what_they_do: whatTheyDo })}
            rows={2}
            className="w-full resize-y rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600 focus:border-slate-400 focus:outline-none"
          />
          {companyBrief.sources.length > 0 && (
            <p className="text-xs text-slate-400">
              Sources: {companyBrief.sources.map((s) => new URL(s).pathname || "/").join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
