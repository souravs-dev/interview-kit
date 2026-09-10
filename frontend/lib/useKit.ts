"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Kit } from "@interview-prep-kit/shared";
import { api } from "./apiClient";

export interface StoredKit extends Kit {
  status: "queued" | "generating" | "ready" | "failed";
}

export interface JobStep {
  name: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface JobState {
  job_id: string;
  status: "running" | "done" | "failed";
  steps: JobStep[];
  error: { code: string; message: string } | null;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Loads a kit and, whenever it's mid-generation, polls the associated job
 * until it settles — recovering job_id via GET /:id/status if the page
 * was refreshed mid-generation and the id isn't already known locally.
 */
export function useKit(kitId: string) {
  const [kit, setKit] = useState<StoredKit | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadKit = useCallback(async (): Promise<StoredKit> => {
    const { kit } = await api.get<{ kit: StoredKit }>(`/api/kits/${kitId}`);
    setKit(kit);
    return kit;
  }, [kitId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      const tick = async () => {
        try {
          const status = await api.get<JobState>(`/api/jobs/${jobId}`);
          setJob(status);
          if (status.status === "running") {
            pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
          } else {
            await loadKit();
          }
        } catch {
          pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      void tick();
    },
    [loadKit, stopPolling],
  );

  const startPollingIfNeeded = useCallback(
    async (loadedKit: StoredKit) => {
      if (loadedKit.status !== "queued" && loadedKit.status !== "generating") return;
      const { job_id } = await api.get<{ job_id: string | null }>(`/api/kits/${kitId}/status`);
      if (job_id) pollJob(job_id);
    },
    [kitId, pollJob],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const loadedKit = await loadKit();
        if (!cancelled) await startPollingIfNeeded(loadedKit);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load kit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId]);

  /** Call after triggering a regenerate — starts polling that job and reloads the kit once it settles. */
  const trackJob = useCallback((jobId: string) => pollJob(jobId), [pollJob]);

  return { kit, job, loading, error, reload: loadKit, trackJob };
}
