"use client";

import { useState } from "react";
import type { Flashcard } from "@interview-prep-kit/shared";
import { api } from "@/lib/apiClient";

const SOURCE_BADGE: Record<string, string> = {
  generated: "bg-slate-100 text-slate-600",
  edited: "bg-blue-100 text-blue-700",
  user_added: "bg-purple-100 text-purple-700",
};

function FlashcardCard({
  flashcard,
  onEdit,
  onDelete,
  onPin,
}: {
  flashcard: Flashcard;
  onEdit: (patch: { front?: string; back?: string }) => void;
  onDelete: () => void;
  onPin: (pinned: boolean) => void;
}) {
  const [front, setFront] = useState(flashcard.front);
  const [back, setBack] = useState(flashcard.back);
  const source = flashcard._meta?.source ?? "generated";
  const pinned = flashcard._meta?.pinned ?? false;

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 font-medium ${SOURCE_BADGE[source]}`}>{source.replace("_", " ")}</span>
          {pinned && <span className="text-amber-600">📌 pinned</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onPin(!pinned)} className="text-slate-500 hover:underline">
            {pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={onDelete} className="text-red-500 hover:underline">
            Delete
          </button>
        </div>
      </div>
      <input
        value={front}
        onChange={(e) => setFront(e.target.value)}
        onBlur={() => front !== flashcard.front && onEdit({ front })}
        className="w-full rounded border border-slate-200 px-2 py-1 text-sm font-medium focus:border-slate-400 focus:outline-none"
      />
      <textarea
        value={back}
        onChange={(e) => setBack(e.target.value)}
        onBlur={() => back !== flashcard.back && onEdit({ back })}
        rows={2}
        className="mt-1 w-full resize-y rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600 focus:border-slate-400 focus:outline-none"
      />
    </li>
  );
}

export function FlashcardPanel({ kitId, flashcards, onRegenerate, onChanged }: { kitId: string; flashcards: Flashcard[]; onRegenerate: (jobId: string) => void; onChanged: () => void }) {
  async function handleEdit(fid: string, patch: { front?: string; back?: string }) {
    await api.patch(`/api/kits/${kitId}/flashcards/${fid}`, patch);
    onChanged();
  }
  async function handleDelete(fid: string) {
    await api.delete(`/api/kits/${kitId}/flashcards/${fid}`);
    onChanged();
  }
  async function handlePin(fid: string, pinned: boolean) {
    await api.post(`/api/kits/${kitId}/flashcards/${fid}/pin`, { pinned });
    onChanged();
  }
  async function handleAdd() {
    await api.post(`/api/kits/${kitId}/flashcards`, { front: "New flashcard", back: "", requirement_ids: [] });
    onChanged();
  }
  async function handleRegenerate() {
    const { job_id } = await api.post<{ job_id: string }>(`/api/kits/${kitId}/regenerate`, { section: "flashcards" });
    onRegenerate(job_id);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Flashcards</h2>
        <div className="flex gap-3 text-xs">
          <button onClick={handleAdd} className="text-slate-600 underline hover:text-slate-900">
            + Add flashcard
          </button>
          <button onClick={handleRegenerate} className="text-slate-600 underline hover:text-slate-900">
            Regenerate
          </button>
        </div>
      </div>
      {flashcards.length === 0 && <p className="text-sm text-slate-400">No flashcards yet.</p>}
      <ul className="space-y-2">
        {flashcards.map((f) => (
          <FlashcardCard key={f.id} flashcard={f} onEdit={(patch) => handleEdit(f.id, patch)} onDelete={() => handleDelete(f.id)} onPin={(p) => handlePin(f.id, p)} />
        ))}
      </ul>
    </section>
  );
}
