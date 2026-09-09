"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { SafeUser } from "@/lib/client/types";
import { Button, ErrorText } from "./ui";
import { IdeaChips } from "./HomeExtras";
import { ArrowUp } from "lucide-react";

const PENDING_KEY = "bb.pendingPrompt";

export function stashInitialPrompt(projectId: string, prompt: string) {
  try {
    sessionStorage.setItem(`bb.initial.${projectId}`, prompt);
  } catch {
    /* ignore */
  }
}

/** The first screen: one big question, one button. */
export function HomePrompt({ user }: { user: SafeUser | null }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  async function build(text: string) {
    setBusy(true);
    setError(null);
    try {
      // The kind of project (website / app / Next.js) is chosen automatically from the description.
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

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl px-4">
      <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight sm:text-4xl">What do you want to build?</h1>
      <div className="rounded-2xl border border-line bg-surface focus-within:border-stone-400">
        <textarea
          ref={ref}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="Build me a modern website for my Minecraft server with a server status, leaderboard and a dark theme..."
          rows={4}
          disabled={busy}
          className="w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-relaxed outline-none placeholder:text-stone-400"
          autoFocus
        />
        <div className="flex items-center justify-end gap-3 px-3 pb-3">
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            {busy ? "Creating your project" : "Build"} {busy ? null : <ArrowUp size={16} />}
          </Button>
        </div>
      </div>
      <IdeaChips
        onPick={(p) => {
          setPrompt(p);
          ref.current?.focus();
        }}
      />
      <div className="mt-3 min-h-6">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
