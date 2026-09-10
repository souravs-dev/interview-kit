"use client";

import type { Question, QuestionCategory } from "@interview-prep-kit/shared";
import { api } from "@/lib/apiClient";
import { QuestionCard } from "./QuestionCard";

interface Props {
  kitId: string;
  category: QuestionCategory;
  questions: Question[];
  onRegenerate: (jobId: string) => void;
  onChanged: () => void;
}

export function QuestionCategoryPanel({ kitId, category, questions, onRegenerate, onChanged }: Props) {
  async function handleEdit(qid: string, patch: { prompt?: string; answer_outline?: string }) {
    await api.patch(`/api/kits/${kitId}/questions/${qid}`, patch);
    onChanged();
  }

  async function handleDelete(qid: string) {
    await api.delete(`/api/kits/${kitId}/questions/${qid}`);
    onChanged();
  }

  async function handlePin(qid: string, pinned: boolean) {
    await api.post(`/api/kits/${kitId}/questions/${qid}/pin`, { pinned });
    onChanged();
  }

  async function handleMove(qid: string, to_category: QuestionCategory) {
    await api.post(`/api/kits/${kitId}/questions/${qid}/move`, { to_category });
    onChanged();
  }

  async function handleReorder(ids: string[]) {
    await api.post(`/api/kits/${kitId}/questions/reorder`, { category, ordered_ids: ids });
    onChanged();
  }

  async function handleAdd() {
    await api.post(`/api/kits/${kitId}/questions`, { category, prompt: "New question", answer_outline: "", requirement_ids: [], difficulty: 1 });
    onChanged();
  }

  async function handleRegenerate() {
    const { job_id } = await api.post<{ job_id: string }>(`/api/kits/${kitId}/regenerate`, { section: `questions:${category}` });
    onRegenerate(job_id);
  }

  function moveUpDown(index: number, dir: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= ids.length) return;
    [ids[index], ids[newIndex]] = [ids[newIndex]!, ids[index]!];
    void handleReorder(ids);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium capitalize text-slate-800">{category.replace("-", " ")}</h3>
        <div className="flex gap-3 text-xs">
          <button onClick={handleAdd} className="text-slate-600 underline hover:text-slate-900">
            + Add question
          </button>
          <button onClick={handleRegenerate} className="text-slate-600 underline hover:text-slate-900">
            Regenerate
          </button>
        </div>
      </div>
      {questions.length === 0 && <p className="text-sm text-slate-400">No questions in this category yet.</p>}
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            onEdit={(patch) => handleEdit(q.id, patch)}
            onDelete={() => handleDelete(q.id)}
            onPin={(pinned) => handlePin(q.id, pinned)}
            onMoveCategory={(cat) => handleMove(q.id, cat)}
            onMoveUp={() => moveUpDown(i, -1)}
            onMoveDown={() => moveUpDown(i, 1)}
          />
        ))}
      </ul>
    </div>
  );
}
