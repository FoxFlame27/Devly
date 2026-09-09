import type { FileChanges } from "../projects/files";

/** Events streamed to the browser while the agent works. No hidden reasoning is ever included. */
export type AgentEvent =
  | { type: "run"; runId: string; conversationId: string; messageId: string }
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; label: string; detail?: string }
  | { type: "tool_end"; id: string; name: string; ok: boolean; summary: string }
  | { type: "changes"; changes: FileChanges }
  | { type: "preview"; status: string; url: string | null }
  | { type: "done"; messageId: string; changes: FileChanges; promptsRemaining: number | null; stopped: boolean }
  | { type: "error"; message: string; retryable: boolean };

export type ActivityItem = { id: string; name: string; label: string; detail?: string; ok?: boolean; summary?: string };

export function encodeSse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
