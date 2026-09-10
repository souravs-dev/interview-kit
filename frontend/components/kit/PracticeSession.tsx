"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";

interface PracticeCard {
  id: string;
  front: string;
  back: string;
  lastConfidence: number | null;
  timesReviewed: number;
}

interface SessionResponse {
  queue: PracticeCard[];
  coverage: { total: number; reviewed: number; remaining: number };
}

const CONFIDENCE_LABELS = ["Not at all", "Barely", "Somewhat", "Confident", "Nailed it"];

export function PracticeSession({ kitId }: { kitId: string }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setLoading(true);
    const data = await api.get<SessionResponse>(`/api/kits/${kitId}/practice/session`);
    setSession(data);
    setIndex(0);
    setRevealed(false);
    setLoading(false);
  }, [kitId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount for the practice queue
    void loadSession();
  }, [loadSession]);

  async function handleConfidence(confidence: number) {
    const card = session!.queue[index]!;
    await api.post(`/api/kits/${kitId}/flashcards/${card.id}/confidence`, { confidence });
    // Optimistic local update — the "reviewed" count would otherwise only
    // refresh at the end of the session (loadSession), which reads as
    // stuck/broken while stepping through cards one at a time.
    if (card.timesReviewed === 0) {
      setSession((prev) => (prev ? { ...prev, coverage: { ...prev.coverage, reviewed: prev.coverage.reviewed + 1, remaining: prev.coverage.remaining - 1 } } : prev));
    }
    if (index + 1 < session!.queue.length) {
      setIndex(index + 1);
      setRevealed(false);
    } else {
      await loadSession(); // session complete — reload, re-ordered by fresh confidence
    }
  }

  if (loading) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-400">Loading…</div>;
  if (!session || session.queue.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-400">
        No flashcards to practice yet.
        <div className="mt-4">
          <Link href={`/kits/${kitId}`} className="text-sm text-slate-600 underline">
            Back to kit
          </Link>
        </div>
      </div>
    );
  }

  const card = session.queue[index]!;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <Link href={`/kits/${kitId}`} className="underline">
          Back to kit
        </Link>
        <span>
          {session.coverage.reviewed} / {session.coverage.total} reviewed
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="mb-6 text-lg font-medium text-slate-900">{card.front}</p>
        {revealed ? (
          <>
            <p className="mb-6 whitespace-pre-wrap text-slate-600">{card.back}</p>
            <p className="mb-3 text-sm font-medium text-slate-500">How confident did you feel?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => handleConfidence(n)}
                  title={CONFIDENCE_LABELS[n - 1]}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-sm font-medium hover:bg-slate-100"
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Reveal answer
          </button>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">
        Card {index + 1} of {session.queue.length} — ordered by least confident first
      </p>
    </div>
  );
}
