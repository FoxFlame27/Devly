"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, ArrowUp, Globe, LayoutDashboard, Gamepad2, Store, Image as ImageIcon, RefreshCw, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import type { SafeUser } from "@/lib/client/types";
import { ErrorText, Spinner } from "./ui";
import { IDEAS } from "./HomeExtras";

const PENDING_KEY = "bb.pendingPrompt";

const TYPES = [
  { icon: Globe, label: "Website", start: "Build a website for " },
  { icon: LayoutDashboard, label: "App", start: "Build an app that " },
  { icon: Gamepad2, label: "Game", start: "Build a browser game where " },
  { icon: Store, label: "Shop", start: "Build an online shop for " },
  { icon: ImageIcon, label: "Portfolio", start: "Build a portfolio site for " },
];

export function stashInitialPrompt(projectId: string, prompt: string) {
  try {
    sessionStorage.setItem(`bb.initial.${projectId}`, prompt);
  } catch {
    /* ignore */
  }
}

/** The first screen: one question, one box, one button. */
export function HomePrompt({ user }: { user: SafeUser | null }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleOffset, setExampleOffset] = useState(0);
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  async function build(text: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: { prompt: text } });
      stashInitialPrompt(r.project.id, text);
      router.push(`/p/${r.project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // After signing up, continue with the prompt the user typed before.
  useEffect(() => {
    if (!user || started.current) return;
    const t = setTimeout(() => {
      try {
        const pending = sessionStorage.getItem(PENDING_KEY);
        if (pending) {
          started.current = true;
          sessionStorage.removeItem(PENDING_KEY);
          const { text } = JSON.parse(pending) as { text: string };
          setPrompt(text);
          void build(text);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text) {
      ref.current?.focus();
      return;
    }
    if (!user) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ text }));
      } catch {
        /* ignore */
      }
      router.push("/signup?next=/");
      return;
    }
    void build(text);
  }

  const pick = (text: string) => {
    setPrompt(text);
    ref.current?.focus();
  };
  const examples = [0, 1, 2].map((i) => IDEAS[(exampleOffset + i) % IDEAS.length]);

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl px-4">
      <h1 className="font-display text-center text-[40px] font-normal leading-tight tracking-[-0.01em] sm:text-[48px]">What will you build?</h1>
      <p className="mt-3 text-center text-sm text-muted">Turn ideas into apps in minutes — no coding needed</p>

      <div className="mt-8 rounded-2xl border border-line bg-surface shadow-[0_8px_30px_-16px_rgba(0,0,0,0.4)] focus-within:border-stone-400">
        <textarea
          ref={ref}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Build a game..."
          rows={2}
          disabled={busy}
          className="w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-stone-400"
          autoFocus
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <button type="button" onClick={() => pick(examples[0].prompt)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-stone-100 hover:text-ink" title="Insert an example">
            <Plus size={16} />
          </button>
          <button type="submit" disabled={busy || !prompt.trim()} className="grid size-8 place-items-center rounded-full bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40" aria-label="Build">
            {busy ? <Spinner className="size-4" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button type="button" className="text-stone-400" aria-hidden tabIndex={-1}>
          <ArrowLeft size={14} />
        </button>
        <div className="flex gap-5">
          {TYPES.map((t) => (
            <button key={t.label} type="button" onClick={() => pick(t.start)} className="flex flex-col items-center gap-1.5 text-[12px] text-muted hover:text-ink">
              <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface">
                <t.icon size={16} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="text-stone-400" aria-hidden tabIndex={-1}>
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
        Try an example prompt
        <button type="button" onClick={() => setExampleOffset((o) => o + 3)} className="rounded p-0.5 hover:text-ink" title="More examples">
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {examples.map((i) => (
          <button key={i.label} type="button" onClick={() => pick(i.prompt)} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink hover:border-stone-400">
            {i.label}
          </button>
        ))}
      </div>
      <div className="mt-3 min-h-6">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
