"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/SessionProvider";

/** Client-side route guard — signed-out visitors are redirected before protected content ever renders. The API independently enforces this too (requireAuth), since client-side gating alone is never sufficient. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400" role="status">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
