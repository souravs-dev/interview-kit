"use client";

import { useState } from "react";
import type { Question, QuestionCategory } from "@interview-prep-kit/shared";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];

const SOURCE_BADGE: Record<string, string> = {
  generated: "bg-slate-100 text-slate-600",
  edited: "bg-blue-100 text-blue-700",
  user_added: "bg-purple-100 text-purple-700",
};

interface Props {
  question: Question;
  onEdit: (patch: { prompt?: string; answer_outline?: string }) => void;
  onDelete: () => void;
  onPin: (pinned: boolean) => void;
  onMoveCategory: (category: QuestionCategory) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function QuestionCard({ question, onEdit, onDelete, onPin, onMoveCategory, onMoveUp, onMoveDown }: Props) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [answerOutline, setAnswerOutline] = useState(question.answer_outline);
  const source = question._meta?.source ?? "generated";
  const pinned = question._meta?.pinned ?? false;

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_BADGE[source]}`}>{source.replace("_", " ")}</span>
          {pinned && <span className="text-xs text-amber-600" title="Pinned — survives regeneration">📌 pinned</span>}
          <span className="text-xs text-slate-400">Difficulty {question.difficulty}/3</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <button onClick={onMoveUp} aria-label="Move up" className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">
            ↑
          </button>
          <button onClick={onMoveDown} aria-label="Move down" className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">
            ↓
          </button>
          <select
            value={question.category}
            onChange={(e) => onMoveCategory(e.target.value as QuestionCategory)}
            aria-label="Move to category"
            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button onClick={() => onPin(!pinned)} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">
            {pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={onDelete} className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => prompt !== question.prompt && onEdit({ prompt })}
        rows={2}
        className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none"
      />
      <textarea
        value={answerOutline}
        onChange={(e) => setAnswerOutline(e.target.value)}
        onBlur={() => answerOutline !== question.answer_outline && onEdit({ answer_outline: answerOutline })}
        rows={2}
        placeholder="Answer outline"
        className="mt-1 w-full resize-y rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600 focus:border-slate-400 focus:outline-none"
      />
    </li>
  );
}
