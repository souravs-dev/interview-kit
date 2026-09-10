"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";

interface KitSummary {
  id: string;
  company: string;
  role: string;
  status: "queued" | "generating" | "ready" | "failed";
  createdAt: string;
}

const STATUS_STYLES: Record<KitSummary["status"], string> = {
  queued: "bg-amber-100 text-amber-800",
  generating: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function KitDashboard() {
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function loadKits() {
    const { kits } = await api.get<{ kits: KitSummary[] }>("/api/kits");
    setKits(kits);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount for the kit list
    void loadKits();
  }, []);

  async function handleSubmit(e: FormEvent, force = false) {
    e.preventDefault();
    setError(null);
    setDuplicateOf(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ kit_id: string }>("/api/kits", { jd, company_url: companyUrl, days, force: force || undefined });
      router.push(`/kits/${result.kit_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_KIT") {
        setDuplicateOf((err.extra?.existing_kit_id as string) ?? null);
        setError("You already created a kit for this exact job description and company.");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="mb-4 text-lg font-semibold">Create a new prep kit</h1>
        <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
          {error && (
            <div role="alert" className="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{error}</p>
              {duplicateOf && (
                <div className="flex gap-3">
                  <Link href={`/kits/${duplicateOf}`} className="font-medium underline">
                    Open existing kit
                  </Link>
                  <button type="button" onClick={(e) => handleSubmit(e, true)} className="font-medium underline">
                    Create anyway
                  </button>
                </div>
              )}
            </div>
          )}
          <div>
            <label htmlFor="jd" className="block text-sm font-medium text-slate-700">
              Job description
            </label>
            <textarea
              id="jd"
              required
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="company_url" className="block text-sm font-medium text-slate-700">
                Company website
              </label>
              <input
                id="company_url"
                type="url"
                required
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://acme.com"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="days" className="block text-sm font-medium text-slate-700">
                Days until interview
              </label>
              <input
                id="days"
                type="number"
                min={1}
                required
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Generate prep kit"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your kits</h2>
        {kits === null && <p className="text-sm text-slate-400">Loading…</p>}
        {kits !== null && kits.length === 0 && <p className="text-sm text-slate-400">No kits yet — create one above.</p>}
        <ul className="space-y-2">
          {kits?.map((kit) => (
            <li key={kit.id}>
              <Link
                href={`/kits/${kit.id}`}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 hover:border-slate-300"
              >
                <span>
                  <span className="font-medium">{kit.role || "Untitled role"}</span>
                  <span className="text-slate-400"> · {kit.company || "Unknown company"}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[kit.status]}`}>{kit.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
