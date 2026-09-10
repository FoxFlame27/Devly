"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Clock, FolderOpen, LogOut, Menu, Plus, Shield, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { TimeAgo } from "./TimeAgo";
import type { ProjectSummary, SafeUser } from "@/lib/client/types";
import { Button, Logo } from "./ui";
import { PromptCounter } from "./PromptCounter";
import { ThemePicker } from "./ThemePicker";

type Props = { user: SafeUser | null; projects: ProjectSummary[]; children: ReactNode; active?: "home" | "projects" };

/** Left sidebar (open by default, collapsible) + page content. */
export function AppShell({ user: initialUser, projects, children, active = "home" }: Props) {
  const [user, setUser] = useState(initialUser);
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setOpen(localStorage.getItem("y5.sidebar") !== "closed");
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("y5.sidebar", o ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !o;
    });
  };

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm";
  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-3">
        <Logo />
        <button onClick={() => (window.innerWidth < 768 ? setMobileOpen(false) : toggle())} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-stone-100 hover:text-ink" aria-label="Close menu">
          <X size={16} />
        </button>
      </div>
      <div className="px-3">
        <Link href="/" onClick={() => setMobileOpen(false)}>
          <Button variant="primary" className="w-full">
            <Plus size={16} /> New project
          </Button>
        </Link>
      </div>
      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 scroll-thin">
        {user ? (
          <>
            <Link href="/" onClick={() => setMobileOpen(false)} className={`${item} ${active === "home" ? "bg-stone-100 text-ink" : "text-muted hover:bg-stone-100 hover:text-ink"}`}>
              <Sparkles size={16} /> Build
            </Link>
            <Link href="/projects" onClick={() => setMobileOpen(false)} className={`${item} ${active === "projects" ? "bg-stone-100 text-ink" : "text-muted hover:bg-stone-100 hover:text-ink"}`}>
              <FolderOpen size={16} /> All projects
            </Link>
            {user.role === "ADMIN" ? (
              <Link href="/admin" className={`${item} text-muted hover:bg-stone-100 hover:text-ink`}>
                <Shield size={16} /> Admin
              </Link>
            ) : null}
            <div className="mt-4 flex items-center gap-1.5 px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              <Clock size={12} /> Recent
            </div>
            {projects.length === 0 ? <p className="px-2.5 py-1 text-sm text-muted">No projects yet.</p> : null}
            {projects.slice(0, 12).map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} onClick={() => setMobileOpen(false)} className="block rounded-lg px-2.5 py-1.5 hover:bg-stone-100">
                <div className="truncate text-sm">{p.name}</div>
                <div className="text-[11px] text-muted"><TimeAgo date={p.updatedAt} /></div>
              </Link>
            ))}
          </>
        ) : (
          <div className="space-y-1">
            <Link href="/login" className={`${item} text-muted hover:bg-stone-100 hover:text-ink`}>
              Log in
            </Link>
            <Link href="/signup" className={`${item} text-muted hover:bg-stone-100 hover:text-ink`}>
              Sign up
            </Link>
          </div>
        )}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center justify-between gap-2">
          {user ? <PromptCounter user={user} onUser={setUser} /> : <span />}
          <ThemePicker />
        </div>
        {user ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link href="/account" onClick={() => setMobileOpen(false)} className="min-w-0 truncate text-xs text-muted hover:text-ink hover:underline" title="Account settings (change password)">
              {user.email}
            </Link>
            <button onClick={logout} className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-ink" title="Log out">
              <LogOut size={13} /> Log out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={`hidden shrink-0 border-r border-line bg-sidebar transition-[width] md:block ${open ? "w-64" : "w-0 overflow-hidden border-r-0"}`}>{nav}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar" onClick={(e) => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 px-3">
          <button onClick={() => setMobileOpen(true)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-stone-100 hover:text-ink md:hidden" aria-label="Open menu">
            <Menu size={18} />
          </button>
          {!open ? (
            <button onClick={toggle} className="hidden size-8 place-items-center rounded-lg text-muted hover:bg-stone-100 hover:text-ink md:grid" aria-label="Open menu">
              <Menu size={18} />
            </button>
          ) : null}
          {!open ? <Logo className="hidden md:inline-flex" /> : <span className="md:hidden"><Logo /></span>}
        </div>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
