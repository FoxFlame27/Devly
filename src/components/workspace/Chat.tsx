"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ConversationSummary, EffortChoice, EffortOption, ModelOption } from "@/lib/client/types";
import { Button, Spinner } from "../ui";
import { ModelPicker } from "./ModelPicker";
import { ArrowUp, Square } from "lucide-react";
import { findUrls, LinkChip, TextWithLinks } from "../LinkChip";

type Props = {
  messages: ChatMessage[];
  conversations: ConversationSummary[];
  conversationId: string | null;
  running: boolean;
  status: string | null;
  models: ModelOption[];
  model: string;
  onModel: (m: string) => void;
  efforts: EffortOption[];
  effort: EffortChoice;
  onEffort: (e: EffortChoice) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onOpenConversation: (id: string | null) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  disabledReason?: string | null;
  advanced: boolean;
};

export function Chat(p: Props) {
  const [text, setText] = useState("");
  const [convOpen, setConvOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [p.messages, p.status]);

  function submit() {
    const t = text.trim();
    if (!t || p.running) return;
    setText("");
    p.onSend(t);
    stickToBottom.current = true;
  }

  const current = p.conversations.find((c) => c.id === p.conversationId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex h-11 w-full max-w-3xl shrink-0 items-center justify-between px-3">
        <div className="relative min-w-0">
          <button onClick={() => setConvOpen((o) => !o)} className="flex max-w-[220px] items-center gap-1 truncate rounded-lg px-2 py-1 text-sm hover:bg-stone-100">
            <span className="truncate">{current?.title ?? "New conversation"}</span>
            <span className="text-muted">▾</span>
          </button>
          {convOpen ? (
            <div className="absolute left-0 top-9 z-30 w-72 rounded-xl border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setConvOpen(false)}>
              <button
                onClick={() => {
                  p.onNewConversation();
                  setConvOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-stone-100"
              >
                + New conversation
              </button>
              <div className="max-h-64 overflow-y-auto scroll-thin">
                {p.conversations.map((c) => (
                  <div key={c.id} className={`group flex items-center gap-1 rounded-lg px-1 ${c.id === p.conversationId ? "bg-stone-100" : "hover:bg-stone-50"}`}>
                    <button
                      onClick={() => {
                        p.onOpenConversation(c.id);
                        setConvOpen(false);
                      }}
                      className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                    >
                      {c.title}
                    </button>
                    <button onClick={() => p.onDeleteConversation(c.id)} className="rounded px-1.5 py-1 text-xs text-muted opacity-0 hover:text-red-600 group-hover:opacity-100" title="Delete conversation">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scroll-thin"
      >
        <div className="mx-auto max-w-3xl">
        {p.messages.length === 0 ? (
          <div className="mt-10 text-center text-sm text-muted">
            <p className="text-ink">Tell me what to build or change.</p>
            <p className="mt-1 text-xs">For example: &ldquo;Make the header sticky&rdquo; or &ldquo;Add a contact form&rdquo;.</p>
          </div>
        ) : null}
        <div className="space-y-5">
          {p.messages.map((m, i) => (
            <Message key={m.id} m={m} isLast={i === p.messages.length - 1} running={p.running} status={p.status} onRetry={p.onRetry} advanced={p.advanced} />
          ))}
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 p-3 pb-4">
        {p.disabledReason ? <p className="mb-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-muted">{p.disabledReason}</p> : null}
        <div className="rounded-2xl border border-line bg-surface shadow-[0_8px_30px_-16px_rgba(0,0,0,0.5)] focus-within:border-stone-400">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={p.messages.length ? "What should I change?" : "Describe what you want to build..."}
            rows={3}
            className="w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-stone-400"
          />
          {findUrls(text).length ? (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {findUrls(text).map((u) => (
                <LinkChip key={u} url={u} />
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between px-2 pb-2">
            <ModelPicker models={p.models} model={p.model} onModel={p.onModel} efforts={p.efforts} effort={p.effort} onEffort={p.onEffort} />
            {p.running ? (
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={submit} disabled={!text.trim()} title="Add to the queue">
                  Queue
                </Button>
                <Button size="sm" variant="secondary" onClick={p.onStop}>
                  <Square size={12} /> Stop
                </Button>
              </span>
            ) : (
              <button onClick={submit} disabled={!text.trim() || !!p.disabledReason} aria-label="Send" className="grid size-8 place-items-center rounded-lg bg-accent text-white hover:brightness-95 disabled:opacity-40">
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ m, isLast, running, status, onRetry, advanced }: { m: ChatMessage; isLast: boolean; running: boolean; status: string | null; onRetry: () => void; advanced: boolean }) {
  if (m.role === "USER") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-200 px-4 py-2.5 text-[15px] text-ink">
          <TextWithLinks text={m.content} />
        </div>
      </div>
    );
  }
  const active = m.pending && running && isLast;
  const changes = m.changes;
  const hasChanges = changes && (changes.created.length || changes.changed.length || changes.deleted.length);
  return (
    <div className="max-w-[95%] space-y-2">
      {m.activity && m.activity.length ? <Activity items={m.activity} advanced={advanced} /> : null}
      {m.content ? (
        <div className="prose-chat">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (href && /^https?:\/\//.test(href) ? <LinkChip url={href} label={typeof children === "string" ? children : undefined} /> : <a href={href}>{children}</a>),
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
      ) : null}
      {active ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-3.5" />
          <span>{status ?? "Working..."}</span>
        </div>
      ) : null}
      {hasChanges ? <ChangeSummary changes={changes} /> : null}
      {m.status === "STOPPED" && !active ? <p className="text-xs text-muted">Stopped.</p> : null}
      {m.error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{m.error}</span>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Activity({ items, advanced }: { items: NonNullable<ChatMessage["activity"]>; advanced: boolean }) {
  const [open, setOpen] = useState(false);
  const last = items[items.length - 1];
  const done = items.every((i) => i.ok !== undefined);
  return (
    <div className="rounded-xl border border-line bg-stone-50/60 text-xs">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-muted hover:text-ink">
        <span className="truncate">
          {done ? `${items.length} step${items.length === 1 ? "" : "s"}` : last?.label}
          {done && last?.detail ? ` · last: ${last.label}` : ""}
        </span>
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ul className="space-y-1 border-t border-line px-3 py-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${a.ok === undefined ? "bg-amber-400 dot-pulse" : a.ok ? "bg-green-500" : "bg-red-600"}`} />
              <span className="min-w-0">
                <span className="text-ink">{a.label}</span>
                {a.detail && a.detail !== a.label ? <span className="text-muted"> · {a.detail}</span> : null}
                {advanced && a.summary ? <div className="truncate font-mono text-[11px] text-stone-400">{a.summary}</div> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChangeRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <span className="text-muted">{label}: </span>
      <span className="font-mono text-[11px] text-ink">{items.slice(0, 12).join(", ")}{items.length > 12 ? ` +${items.length - 12} more` : ""}</span>
    </div>
  );
}

function ChangeSummary({ changes }: { changes: NonNullable<ChatMessage["changes"]> }) {
  return (
    <div className="space-y-0.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs">
      <ChangeRow label="Created" items={changes.created} />
      <ChangeRow label="Changed" items={changes.changed} />
      <ChangeRow label="Deleted" items={changes.deleted} />
    </div>
  );
}
