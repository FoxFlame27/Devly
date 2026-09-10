"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Wand2 } from "lucide-react";
import { streamSse } from "@/lib/client/sse";
import type { ModelOption } from "@/lib/client/types";
import { Button, Spinner } from "../ui";
import { useAutosize } from "@/lib/client/useAutosize";

type Msg = { role: "user" | "assistant"; content: string; error?: string };
type Ev = { type: "text"; delta: string } | { type: "done"; model: string } | { type: "error"; message: string };

type Props = { projectId: string; models: ModelOption[]; context: { tab: string; filePath?: string | null }; onHandoff: (text: string) => void; builderBusy: boolean };

/** A second, lighter AI: ask anything about the project or the tab you're on. Can hand a request to the builder. */
export function AskPane({ projectId, models, context, onHandoff, builderBusy }: Props) {
  const preferred = models.find((m) => /^gemini/.test(m.id)) ?? models.find((m) => /mini|flash|haiku/.test(m.id)) ?? models[0];
  const [model, setModel] = useState(preferred?.id ?? "");
  const storeKey = `devly.ask.${projectId}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(storeKey) : null;
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [msgs, storeKey]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(inputRef, text, 200);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [msgs]);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const history = msgs.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    const update = (fn: (m: Msg) => Msg) => setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? fn(x) : x)));
    try {
      await streamSse<Ev>(`/api/projects/${projectId}/ask`, { message: q, history, model, context: { tab: context.tab, filePath: context.filePath ?? undefined } }, (e) => {
        if (e.type === "text") update((m) => ({ ...m, content: m.content + e.delta }));
        else if (e.type === "error") update((m) => ({ ...m, error: e.message }));
      });
    } catch (e) {
      update((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  const lastQuestion = [...msgs].reverse().find((m) => m.role === "user")?.content;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3 text-xs text-muted">
        <span>
          Ask about your project{context.filePath ? ` · looking at ${context.filePath}` : context.tab === "preview" ? " · looking at the preview" : ""}
        </span>
        {models.length > 1 ? (
          <label className="flex items-center gap-1">
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scroll-thin">
        {msgs.length === 0 ? (
          <div className="mt-8 text-center text-sm text-muted">
            <p className="text-ink">Ask anything.</p>
            <p className="mt-1 text-xs">&ldquo;Why is the button not centered?&rdquo; · &ldquo;What could I add next?&rdquo; · &ldquo;Explain this file&rdquo;</p>
            <p className="mt-1 text-xs">This helper explains and suggests. To change the project, use the main chat or press &ldquo;Do this in the project&rdquo;.</p>
          </div>
        ) : null}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-stone-200 px-3.5 py-2 text-sm">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="max-w-[95%] space-y-2">
              {m.content ? (
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : !m.error ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner className="size-3.5" /> Thinking...
                </div>
              ) : null}
              {m.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{m.error}</p> : null}
              {m.content && !busy && i === msgs.length - 1 && lastQuestion ? (
                <Button size="sm" variant="secondary" disabled={builderBusy} onClick={() => onHandoff(`${lastQuestion}\n\nSuggested approach from the helper:\n${m.content.slice(0, 3000)}`)} title="Send this to the builder so it changes the project">
                  <Wand2 size={13} /> Do this in the project
                </Button>
              ) : null}
            </div>
          ),
        )}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface px-3 py-2 focus-within:border-stone-400">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Ask a question..."
            className="block min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-stone-400 scroll-thin"
          />
          <button onClick={send} disabled={!text.trim() || busy} className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40" aria-label="Ask">
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
