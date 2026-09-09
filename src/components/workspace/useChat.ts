"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { streamSse } from "@/lib/client/sse";
import type { ActivityItem, ChatMessage, ConversationSummary, FileChanges } from "@/lib/client/types";
import type { AgentEvent } from "@/lib/agent/events";

export type ChatState = {
  conversations: ConversationSummary[];
  conversationId: string | null;
  messages: ChatMessage[];
  running: boolean;
  status: string | null;
  error: string | null;
  lastPrompt: string | null;
};

type Handlers = { onDone: (r: { changes: FileChanges; promptsRemaining: number | null }) => void; onPreview: (s: string, url: string | null) => void; onPromptLimit: () => void };

export function useChat(projectId: string, handlers: Handlers) {
  const [state, setState] = useState<ChatState>({ conversations: [], conversationId: null, messages: [], running: false, status: null, error: null, lastPrompt: null });
  const runId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });

  const loadConversations = useCallback(async () => {
    const r = await api<{ conversations: ConversationSummary[] }>(`/api/projects/${projectId}/conversations`);
    setState((s) => ({ ...s, conversations: r.conversations }));
    return r.conversations;
  }, [projectId]);

  const openConversation = useCallback(
    async (id: string | null) => {
      if (!id) {
        setState((s) => ({ ...s, conversationId: null, messages: [], error: null }));
        return;
      }
      const r = await api<{ messages: ChatMessage[] }>(`/api/projects/${projectId}/conversations/${id}`);
      setState((s) => ({ ...s, conversationId: id, messages: r.messages.filter((m) => m.role === "USER" || m.content || m.activity), error: null }));
    },
    [projectId],
  );

  /** Applies agent events to the draft assistant message with the given id. */
  const consume = useCallback(
    async (url: string, body: unknown | undefined, draftId: string, controller: AbortController) => {
      let currentId = draftId;
      const update = (fn: (m: ChatMessage) => ChatMessage) => setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === currentId ? fn(m) : m)) }));
      let stoppedByUser = false;
      try {
        await streamSse<AgentEvent>(
          url,
          body,
          (e) => {
            switch (e.type) {
              case "run":
                runId.current = e.runId;
                setState((s) => ({ ...s, conversationId: e.conversationId, running: true }));
                update((m) => ({ ...m, id: e.messageId }));
                currentId = e.messageId;
                break;
              case "status":
                setState((s) => ({ ...s, status: e.text }));
                break;
              case "text":
                update((m) => ({ ...m, content: m.content + e.delta }));
                break;
              case "tool_start":
                update((m) => ({ ...m, activity: [...(m.activity ?? []), { id: e.id, name: e.name, label: e.label, detail: e.detail } satisfies ActivityItem] }));
                break;
              case "tool_end":
                update((m) => ({ ...m, activity: (m.activity ?? []).map((a) => (a.id === e.id ? { ...a, ok: e.ok, summary: e.summary } : a)) }));
                break;
              case "changes":
                update((m) => ({ ...m, changes: e.changes }));
                break;
              case "preview":
                h.current.onPreview(e.status, e.url);
                break;
              case "error":
                update((m) => ({ ...m, error: e.message, status: "ERROR" }));
                break;
              case "done":
                update((m) => ({ ...m, pending: false, changes: e.changes, status: e.stopped ? "STOPPED" : (m.status ?? "COMPLETE") }));
                h.current.onDone({ changes: e.changes, promptsRemaining: e.promptsRemaining });
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        const e = err as Error & { status?: number; code?: string };
        if (controller.signal.aborted) stoppedByUser = true;
        else {
          if (e.code === "prompt_limit" || e.status === 402) h.current.onPromptLimit();
          update((m) => ({ ...m, pending: false, error: e.message || "Something went wrong.", status: "ERROR" }));
        }
      } finally {
        runId.current = null;
        abort.current = null;
        setState((s) => ({ ...s, running: false, status: null, messages: s.messages.map((m) => (m.pending ? { ...m, pending: false, status: stoppedByUser ? "STOPPED" : m.status } : m)) }));
        loadConversations().catch(() => {});
      }
    },
    [loadConversations],
  );

  /** If the AI is still working on this project (e.g. after navigating away), pick the stream back up. */
  const attachToActiveRun = useCallback(async () => {
    const r = await api<{ run: { runId: string; conversationId: string; messageId: string } | null }>(`/api/projects/${projectId}/chat/active`);
    if (!r.run) return false;
    const { run } = r;
    const existing = await api<{ messages: ChatMessage[] }>(`/api/projects/${projectId}/conversations/${run.conversationId}`);
    const msgs = existing.messages.filter((m) => m.role === "USER" || m.content || m.activity || m.id === run.messageId);
    // The assistant message is still empty in the database; show it as a live draft and replay events into it.
    const draft: ChatMessage = { id: run.messageId, role: "ASSISTANT", content: "", activity: [], pending: true };
    const withDraft = msgs.some((m) => m.id === run.messageId) ? msgs.map((m) => (m.id === run.messageId ? draft : m)) : [...msgs, draft];
    setState((s) => ({ ...s, conversationId: run.conversationId, messages: withDraft, running: true, status: "Working...", error: null }));
    runId.current = run.runId;
    const controller = new AbortController();
    abort.current = controller;
    void consume(`/api/projects/${projectId}/chat/stream?runId=${encodeURIComponent(run.runId)}`, undefined, run.messageId, controller);
    return true;
  }, [projectId, consume]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadConversations();
      if (cancelled) return;
      if (await attachToActiveRun()) return;
      if (!cancelled && list.length) await openConversation(list[0].id);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadConversations, openConversation, attachToActiveRun]);

  const send = useCallback(
    async (text: string, model?: string | null, effort?: string | null) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMsg: ChatMessage = { id: `local-${Date.now()}`, role: "USER", content: trimmed };
      const draft: ChatMessage = { id: `draft-${Date.now()}`, role: "ASSISTANT", content: "", activity: [], pending: true };
      setState((s) => ({ ...s, messages: [...s.messages, userMsg, draft], running: true, status: "Thinking...", error: null, lastPrompt: trimmed }));
      const controller = new AbortController();
      abort.current = controller;
      await consume(`/api/projects/${projectId}/chat`, { message: trimmed, conversationId: state.conversationId, model, effort }, draft.id, controller);
    },
    [projectId, state.conversationId, consume],
  );

  const stop = useCallback(async () => {
    const id = runId.current;
    if (id) await api(`/api/projects/${projectId}/chat/stop`, { method: "POST", json: { runId: id } }).catch(() => {});
    setState((s) => ({ ...s, status: "Stopping..." }));
  }, [projectId]);

  const newConversation = useCallback(async () => {
    setState((s) => ({ ...s, conversationId: null, messages: [], error: null }));
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await api(`/api/projects/${projectId}/conversations/${id}`, { method: "DELETE" });
      const list = await loadConversations();
      if (state.conversationId === id) await openConversation(list[0]?.id ?? null);
    },
    [projectId, loadConversations, openConversation, state.conversationId],
  );

  return { ...state, send, stop, openConversation, newConversation, deleteConversation };
}
