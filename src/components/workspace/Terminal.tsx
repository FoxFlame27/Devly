"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

export function Terminal({ projectId, onRan }: { projectId: string; onRan: () => void }) {
  const [lines, setLines] = useState<string>("Sandbox terminal. Commands run inside your project only.\n");
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const out = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [lines]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const c = cmd.trim();
    if (!c || busy) return;
    setCmd("");
    setHistory((h) => [c, ...h].slice(0, 50));
    setHIdx(-1);
    setBusy(true);
    setLines((l) => `${l}$ ${c}\n`);
    try {
      const res = await fetch(`/api/projects/${projectId}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "fetch" },
        body: JSON.stringify({ command: c }),
        credentials: "same-origin",
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setLines((l) => `${l}${d.error ?? `Error ${res.status}`}\n`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setLines((l) => (l.length > 200_000 ? l.slice(-150_000) : l) + chunk);
      }
    } catch (err) {
      setLines((l) => `${l}${(err as Error).message}\n`);
    } finally {
      setBusy(false);
      onRan();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col code-bg">
      <pre ref={out} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed scroll-thin">
        {lines}
      </pre>
      <form onSubmit={run} className="flex items-center gap-2 border-t border-line px-3 py-2 font-mono text-[12px]">
        <span className="text-muted">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              const i = Math.min(hIdx + 1, history.length - 1);
              setHIdx(i);
              setCmd(history[i] ?? "");
              e.preventDefault();
            } else if (e.key === "ArrowDown") {
              const i = Math.max(hIdx - 1, -1);
              setHIdx(i);
              setCmd(i === -1 ? "" : history[i]);
              e.preventDefault();
            }
          }}
          disabled={busy}
          placeholder={busy ? "Running..." : "npm run build"}
          className="flex-1 bg-transparent outline-none placeholder:text-muted"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <button type="button" onClick={() => setLines("")} className="text-[11px] text-muted hover:text-ink">
          clear
        </button>
      </form>
    </div>
  );
}
