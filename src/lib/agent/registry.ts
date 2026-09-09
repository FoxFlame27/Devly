import "server-only";
import type { AgentEvent } from "./events";

type ActiveRun = { runId: string; projectId: string; userId: string; controller: AbortController; startedAt: number };
type Channel = { projectId: string; userId: string; conversationId: string; messageId: string; events: AgentEvent[]; listeners: Set<(e: AgentEvent) => void>; done: boolean; startedAt: number };

const g = globalThis as unknown as { __runs?: Map<string, ActiveRun>; __channels?: Map<string, Channel> };
const runs = (g.__runs ??= new Map<string, ActiveRun>());
const channels = (g.__channels ??= new Map<string, Channel>());

export function registerRun(run: ActiveRun) {
  runs.set(run.runId, run);
}

export function finishRun(runId: string) {
  runs.delete(runId);
}

/** Aborts a run if it belongs to the user. Returns whether anything was stopped. */
export function stopRun(runId: string, userId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.userId !== userId) return false;
  run.controller.abort();
  return true;
}

export function activeRunForProject(projectId: string): ActiveRun | undefined {
  for (const r of runs.values()) if (r.projectId === projectId) return r;
  return undefined;
}

export function activeRunCount(): number {
  return runs.size;
}

/* ---- Event channels: every run's events are buffered so a browser that navigated away can re-attach. ---- */

export function openChannel(runId: string, meta: { projectId: string; userId: string; conversationId: string; messageId: string }) {
  channels.set(runId, { ...meta, events: [], listeners: new Set(), done: false, startedAt: Date.now() });
}

export function publish(runId: string, e: AgentEvent) {
  const ch = channels.get(runId);
  if (!ch) return;
  ch.events.push(e);
  for (const l of ch.listeners) {
    try {
      l(e);
    } catch {
      /* listener gone */
    }
  }
  if (e.type === "done") {
    ch.done = true;
    setTimeout(() => channels.delete(runId), 5 * 60 * 1000).unref();
  }
}

/** Replays buffered events, then streams live ones. Returns an unsubscribe function. */
export function subscribe(runId: string, listener: (e: AgentEvent) => void): (() => void) | null {
  const ch = channels.get(runId);
  if (!ch) return null;
  for (const e of ch.events) listener(e);
  if (ch.done) return () => {};
  ch.listeners.add(listener);
  return () => ch.listeners.delete(listener);
}

export function channelInfo(runId: string) {
  const ch = channels.get(runId);
  return ch ? { runId, projectId: ch.projectId, userId: ch.userId, conversationId: ch.conversationId, messageId: ch.messageId, done: ch.done, startedAt: ch.startedAt } : null;
}

/** The unfinished run for a project (if any), with the ids the browser needs to re-attach. */
export function activeChannelForProject(projectId: string) {
  for (const [runId, ch] of channels) if (ch.projectId === projectId && !ch.done) return channelInfo(runId);
  return null;
}
