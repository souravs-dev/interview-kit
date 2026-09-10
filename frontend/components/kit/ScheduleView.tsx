import type { Question, Schedule } from "@interview-prep-kit/shared";
import { api } from "@/lib/apiClient";

export function ScheduleView({ kitId, schedule, questions, onRegenerate }: { kitId: string; schedule: Schedule; questions: Question[]; onRegenerate: (jobId: string) => void }) {
  async function handleRegenerate() {
    const { job_id } = await api.post<{ job_id: string }>(`/api/kits/${kitId}/regenerate`, { section: "schedule" });
    onRegenerate(job_id);
  }

  const byId = new Map(questions.map((q) => [q.id, q]));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Study schedule — {schedule.days_available} day{schedule.days_available === 1 ? "" : "s"}
        </h2>
        <button onClick={handleRegenerate} className="text-xs text-slate-600 underline hover:text-slate-900">
          Regenerate
        </button>
      </div>
      <ol className="space-y-3">
        {schedule.days.map((day) => (
          <li key={day.day} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <div className="mb-1 flex items-center justify-between text-sm font-medium text-slate-800">
              <span>
                Day {day.day} — {day.focus}
              </span>
              <span className="text-xs text-slate-500">{day.minutes} min</span>
            </div>
            {day.question_ids.length > 0 ? (
              <ul className="list-inside list-disc text-sm text-slate-600">
                {day.question_ids.map((qid) => (
                  <li key={qid}>{byId.get(qid)?.prompt ?? qid}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Review & light practice</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
