"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/SessionProvider";

export function NavBar() {
  const { user, loading, logout } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          AI Interview Prep Kit
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {!loading && user && (
            <>
              <span className="text-slate-500">{user.email}</span>
              <button onClick={handleLogout} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Log out
              </button>
            </>
          )}
          {!loading && !user && (
            <>
              <Link href="/login" className="text-slate-700 hover:text-slate-900">
                Log in
              </Link>
              <Link href="/register" className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
