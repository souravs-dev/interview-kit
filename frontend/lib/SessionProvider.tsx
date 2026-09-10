"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./apiClient";

export interface SessionUser {
  id: string;
  email: string;
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const { user } = await api.get<{ user: SessionUser }>("/api/auth/session");
      setUser(user);
    } catch {
      // Treat both "not logged in" (401) and a genuinely unreachable API
      // (e.g. the backend cold-starting on Render) the same way — the UI
      // can only show a logged-out state either way, and letting a raw
      // network error bubble out of this fire-and-forget mount effect
      // would surface as an unhandled promise rejection instead.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api.post("/api/auth/logout");
    setUser(null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount to check session state
    void refresh();
  }, []);

  return <SessionContext.Provider value={{ user, loading, refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
