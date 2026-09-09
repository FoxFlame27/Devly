"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { SafeUser } from "@/lib/client/types";
import { Button, Logo } from "./ui";
import { PromptCounter } from "./PromptCounter";
import { ThemePicker } from "./ThemePicker";

export function Header({ user: initial }: { user: SafeUser | null }) {
  const [user, setUser] = useState(initial);
  const [menu, setMenu] = useState(false);
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between px-4 sm:px-6">
      <Logo />
      <nav className="flex items-center gap-2">
        <ThemePicker />
        {user ? (
          <>
            <Link href="/projects" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100 hover:text-ink">
              Projects
            </Link>
            <PromptCounter user={user} onUser={setUser} />
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent-ink" aria-label="Account">
                {(user.name || user.email).slice(0, 1)}
              </button>
              {menu ? (
                <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  <div className="truncate px-3 py-2 text-xs text-muted">{user.email}</div>
                  {user.role === "ADMIN" ? (
                    <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
                      Admin
                    </Link>
                  ) : null}
                  <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100">
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink">
              Log in
            </Link>
            <Link href="/signup">
              <Button variant="primary" size="sm">
                Sign up
              </Button>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
