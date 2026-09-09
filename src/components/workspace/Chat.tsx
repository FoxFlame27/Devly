"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ConversationSummary, EffortChoice, EffortOption, ModelOption } from "@/lib/client/types";
import { Button, Spinner } from "../ui";
import { ModelPicker } from "./ModelPicker";
import { ArrowUp, Square, Trash2, Sparkles, Plus, X } from "lucide-react";
import { readImageForUpload, type Attachment } from "@/lib/client/attachments";
import { api } from "@/lib/client/api";
import { findUrls, LinkChip, TextWithLinks } from "../LinkChip";
import { useAutosize } from "@/lib/client/useAutosize";
import { ModelCard } from "./ModelCard";

function questionOf(m: ChatMessage): { question: string; options: string[] } | null {
  if (m.question) return m.question;
  const a = (m.activity ?? []).find((x) => x.name === "ask_user");
  if (!a) return null;
  let options: string[] = [];
  try {
    options = JSON.parse(a.summary ?? "[]");
  } catch {
    options = [];
  }
  return { question: a.detail ?? "", options };
}

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
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  onRetry: () => void;
  queue: { id: string; text: string }[];
  onUnqueue: (id: string) => void;
  onOpenConversation: (id: string | null) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  disabledReason?: string | null;
  advanced: boolean;
  projectId: string;
};

export function Chat(p: Props) {
  const [text, setText] = useState("");
  const [convOpen, setConvOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  async function addFiles(list: FileList | File[]) {
    setFileError(null);
    const next: Attachment[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 4) {
        setFileError("Up to 4 images per message.");
        break;
      }
      try {
        next.push(await readImageForUpload(f));
      } catch (e) {
        setFileError((e as Error).message);
      }
    }
    setFiles(next);
  }
  async function improve() {
    const t = text.trim();
    if (!t || improving) return;
    setImproving(true);
    try {
      const r = await api<{ text: string }>("/api/prompt/improve", { method: "POST", json: { text: t } });
      if (r.text) setText(r.text);
    } catch {
      /* keep the original text */
    } finally {
      setImproving(false);
      inputRef.current?.focus();
    }
  }
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  useAutosize(inputRef, text, 320);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [p.messages, p.status]);

  function submit() {
    const t = text.trim() || (files.length ? "Look at the attached image." : "");
    if (!t) return;
    setText("");
    p.onSend(t, files.length ? files : undefined);
    setFiles([]);
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
                      <Trash2 size={13} />
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
            <Message key={m.id} m={m} isLast={i === p.messages.length - 1} running={p.running} status={p.status} onRetry={p.onRetry} advanced={p.advanced} projectId={p.projectId} onSend={p.onSend} />
          ))}
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 p-3 pb-4">
        {p.disabledReason ? <p className="mb-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-muted">{p.disabledReason}</p> : null}
        {p.queue.length ? (
          <div className="mb-2 space-y-1">
            {p.queue.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-muted">
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Queued {i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{q.text}</span>
                <button onClick={() => p.onUnqueue(q.id)} className="shrink-0 hover:text-red-600" title="Remove from queue">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-2xl border border-line bg-surface shadow-[0_8px_30px_-16px_rgba(0,0,0,0.5)] focus-within:border-stone-400">
          {files.length ? (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {files.map((f, i) => (
                <div key={i} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${f.type};base64,${f.data}`} alt={f.name} className="h-16 w-16 rounded-lg border border-line object-cover" />
                  <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-bg opacity-0 group-hover:opacity-100" aria-label="Remove image">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {fileError ? <p className="px-4 pt-2 text-xs text-red-600">{fileError}</p> : null}
          <textarea
            ref={inputRef}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            onDrop={(e) => {
              const imgs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={p.running ? "Type the next thing to do. It runs when this one finishes..." : p.messages.length ? "What should I change?" : "Describe what you want to build..."}
            rows={2}
            className="block w-full resize-none bg-transparent px-4 pt-3 text-[15px] leading-relaxed outline-none placeholder:text-stone-400 scroll-thin"
          />
          {findUrls(text).length ? (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {findUrls(text).map((u) => (
                <LinkChip key={u} url={u} />
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="flex items-center gap-1">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files).then(() => (e.target.value = ""))} />
              <button type="button" onClick={() => fileInput.current?.click()} className="grid size-7 place-items-center rounded-full text-muted hover:bg-stone-100 hover:text-ink" title="Add a screenshot or image">
                <Plus size={16} />
              </button>
              <ModelPicker models={p.models} model={p.model} onModel={p.onModel} efforts={p.efforts} effort={p.effort} onEffort={p.onEffort} />
              <button type="button" onClick={improve} disabled={!text.trim() || improving} className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted hover:bg-stone-100 hover:text-ink disabled:opacity-40" title="Let AI improve your prompt">
                {improving ? <Spinner className="size-3.5" /> : <Sparkles size={13} />} Improve
              </button>
            </span>
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

/** Shown when a run was stopped: what got done before stopping, so nothing looks lost. */
function StoppedSummary({ m }: { m: ChatMessage }) {
  const done = (m.activity ?? []).filter((a) => a.ok !== undefined && a.name !== "ask_user");
  const unfinished = (m.activity ?? []).filter((a) => a.ok === undefined);
  const c = m.changes;
  const touched = c ? c.created.length + c.changed.length + c.deleted.length : 0;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
      <p className="font-medium">Stopped.</p>
      {done.length ? (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {done.slice(-8).map((a) => (
            <li key={a.id} className="flex items-center gap-1.5">
              <span className={a.ok ? "text-green-600" : "text-red-600"}>{a.ok ? "✓" : "✕"}</span>
              <span className="truncate">{a.label.replace(/\.\.\.$/, "")}</span>
            </li>
          ))}
          {done.length > 8 ? <li>...and {done.length - 8} more</li> : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted">Nothing was changed yet.</p>
      )}
      {unfinished.length ? <p className="mt-1 text-xs text-muted">Interrupted while: {unfinished[unfinished.length - 1].label.replace(/\.\.\.$/, "")}.</p> : null}
      <p className="mt-1 text-xs text-muted">{touched ? `${touched} file${touched === 1 ? "" : "s"} changed so far are kept.` : ""} Send a message to continue.</p>
    </div>
  );
}

function Message({ m, isLast, running, status, onRetry, advanced, projectId, onSend }: { m: ChatMessage; isLast: boolean; running: boolean; status: string | null; onRetry: () => void; advanced: boolean; projectId: string; onSend: (t: string) => void }) {
  if (m.role === "USER") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-stone-200 px-4 py-2.5 text-[15px] text-ink">
          {m.attachments?.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {m.attachments.map((a, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={`data:${a.type};base64,${a.data}`} alt={a.name} className="max-h-40 max-w-[220px] rounded-lg border border-line object-contain" />
              ))}
            </div>
          ) : null}
          <TextWithLinks text={m.content} />
        </div>
      </div>
    );
  }
  const active = m.pending && running && isLast;
  const changes = m.changes;
  const hasChanges = changes && (changes.created.length || changes.changed.length || changes.deleted.length);
  const models = (m.activity ?? []).filter((a) => (a.name === "generate_3d_model" || a.name === "texture_3d_model") && a.ok && /public\/models\/[\w-]+\.glb/.test(a.summary ?? "")).map((a) => ({ file: a.summary!.match(/public\/models\/[\w-]+\.glb/)![0], name: a.detail ?? "model" }));
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
      {(() => {
        const q = questionOf(m);
        if (!q || !q.options.length) return null;
        return (
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button key={o} disabled={!isLast || running} onClick={() => onSend(o)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-stone-400 disabled:opacity-50">
                {o}
              </button>
            ))}
          </div>
        );
      })()}
      {models.map((mm) => (
        <ModelCard key={mm.file} projectId={projectId} file={mm.file} name={mm.file.replace(/^public\/models\//, "").replace(/\.glb$/, "")} onTexture={onSend} busy={running} />
      ))}
      {hasChanges ? <ChangeSummary changes={changes} /> : null}
      {m.status === "STOPPED" && !active ? <StoppedSummary m={m} /> : null}
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
