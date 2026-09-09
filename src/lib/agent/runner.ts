import "server-only";
import { db } from "../db";
import { getAIProvider, rawAssistantMessage, AIProviderError, type AIContentBlock, type AIMessage } from "../ai";
import { SYSTEM_PROMPT } from "./prompt";
import { buildProjectContext } from "./context";
import { apiToolDefinitions, executeTool, toolByName, type ToolContext } from "./tools";
import { emptyChanges, mergeChanges, syncFromDisk, type FileChanges } from "../projects/files";
import { createSnapshot } from "../projects/snapshots";
import { finishRun, registerRun } from "./registry";
import type { ActivityItem, AgentEvent } from "./events";
import { previewInfo } from "../projects/preview";
import type { Effort } from "@/config/models";

const MAX_MODEL_CALLS = 40;
const MAX_TOOL_CALLS = 120;
const MAX_RUN_MS = 25 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 16_000;
const HISTORY_MESSAGES = 30;
const HISTORY_CHARS_PER_MESSAGE = 6_000;

export type RunInput = {
  projectId: string;
  template: string;
  conversationId: string;
  userId: string;
  model: string;
  effort: Effort;
  unlimited: boolean;
  userMessage: string;
  attachments?: { name: string; type: string; data: string }[];
  runId: string;
  controller: AbortController;
  emit: (e: AgentEvent) => void;
};

export type RunOutput = {
  text: string;
  activity: ActivityItem[];
  changes: FileChanges;
  usage: { inputTokens: number; outputTokens: number };
  steps: number;
  status: "COMPLETE" | "STOPPED" | "ERROR";
  error?: string;
  durationMs: number;
};

async function loadHistory(conversationId: string): Promise<AIMessage[]> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
    select: { role: true, content: true, status: true, attachments: true },
  });
  rows.reverse();
  const out: AIMessage[] = [];
  for (const r of rows) {
    const text = r.content.length > HISTORY_CHARS_PER_MESSAGE ? `${r.content.slice(0, HISTORY_CHARS_PER_MESSAGE)}\n...[trimmed]` : r.content;
    if (!text.trim()) continue;
    const role = r.role === "USER" ? "user" : "assistant";
    // The API requires alternating roles beginning with a user turn; merge same-role neighbours.
    const last = out[out.length - 1];
    const images = role === "user" && Array.isArray(r.attachments) ? (r.attachments as { type: string; data: string }[]).slice(0, 4) : [];
    if (images.length) {
      out.push({ role, content: [{ type: "text", text }, ...images.map((a) => ({ type: "image" as const, mediaType: a.type, data: a.data }))] });
    } else if (last && last.role === role && typeof last.content === "string") last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export async function runAgent(input: RunInput): Promise<RunOutput> {
  const started = Date.now();
  const { runId, controller } = input;
  registerRun({ runId, projectId: input.projectId, userId: input.userId, controller, startedAt: started });
  const emit = input.emit;
  const activity: ActivityItem[] = [];
  const changes = emptyChanges();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let text = "";
  let steps = 0;
  let toolCalls = 0;
  let status: RunOutput["status"] = "COMPLETE";
  let error: string | undefined;

  const ctx: ToolContext = {
    projectId: input.projectId,
    userId: input.userId,
    template: input.template,
    signal: controller.signal,
    changes,
    fixing: false,
    unlimited: input.unlimited,
    status: (text) => emit({ type: "status", text }),
    previewStatus: (s, url) => emit({ type: "preview", status: s, url }),
  };

  try {
    const history = await loadHistory(input.conversationId);
    const dynamic = await buildProjectContext(input.projectId, input.conversationId);
    const attached = (input.attachments ?? []).slice(0, 4);
    const userContent: AIMessage["content"] = attached.length ? [{ type: "text", text: input.userMessage }, ...attached.map((a) => ({ type: "image" as const, mediaType: a.type, data: a.data }))] : input.userMessage;
    const messages: AIMessage[] = [...history, { role: "user", content: userContent }];
    const tools = apiToolDefinitions();
    const provider = getAIProvider(input.model);
    emit({ type: "status", text: "Looking at your project..." });

    let nudgedForMaxTokens = false;
    while (true) {
      if (controller.signal.aborted) break;
      if (steps >= MAX_MODEL_CALLS || toolCalls >= MAX_TOOL_CALLS || Date.now() - started > MAX_RUN_MS) {
        text += `\n\nI stopped here because this request needed more steps than allowed. Tell me to continue if the work isn't finished.`;
        emit({ type: "text", delta: "\n\nI stopped here because this request needed more steps than allowed. Tell me to continue if the work isn't finished." });
        break;
      }
      steps++;
      let sawText = false;
      const turn = await provider.streamTurn({
        model: input.model,
        effort: input.effort,
        system: { stable: SYSTEM_PROMPT, dynamic: `Current project context:\n\n${dynamic}` },
        messages,
        tools,
        maxTokens: MAX_OUTPUT_TOKENS,
        signal: controller.signal,
        onText: (delta) => {
          sawText = true;
          text += delta;
          emit({ type: "text", delta });
        },
      });
      usage.inputTokens += turn.usage.inputTokens;
      usage.outputTokens += turn.usage.outputTokens;
      messages.push(rawAssistantMessage(turn.raw));

      if (turn.stopReason === "refusal") {
        error = "The AI declined this request. Try rephrasing it.";
        status = "ERROR";
        break;
      }
      const toolUses = turn.content.filter((b): b is Extract<AIContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (turn.stopReason === "max_tokens" && toolUses.length === 0) {
        if (nudgedForMaxTokens) break;
        nudgedForMaxTokens = true;
        messages.push({ role: "user", content: "Your previous message was cut off. Continue from where you stopped; use tools for file contents instead of writing them in chat." });
        continue;
      }
      if (toolUses.length === 0) break;
      if (sawText) {
        text += "\n\n";
        emit({ type: "text", delta: "\n\n" });
      }

      const results: AIContentBlock[] = [];
      for (const tu of toolUses) {
        if (controller.signal.aborted) break;
        toolCalls++;
        const def = toolByName(tu.name);
        let label = "Working...";
        try {
          const parsed = def?.schema.safeParse(tu.input ?? {});
          if (def && parsed?.success) label = def.label(parsed.data, ctx);
        } catch {
          /* keep default */
        }
        const item: ActivityItem = { id: tu.id, name: tu.name, label, detail: detailFor(tu.name, tu.input) };
        if ((tu.name === "generate_3d_model" || tu.name === "texture_3d_model") && typeof (tu.input as { name?: unknown })?.name === "string") item.detail = (tu.input as { name: string }).name;
        if (tu.name === "ask_user") {
          const q = tu.input as { question?: string; options?: string[] };
          item.detail = q.question ?? "";
          item.summary = JSON.stringify(q.options ?? []);
        }
        activity.push(item);
        emit({ type: "tool_start", id: tu.id, name: tu.name, label, detail: item.detail });
        emit({ type: "status", text: label });
        const res = await executeTool(tu.name, tu.input, ctx);
        item.ok = res.ok;
        if (tu.name !== "ask_user") item.summary = res.output.split("\n")[0].slice(0, 160);
        emit({ type: "tool_end", id: tu.id, name: tu.name, ok: res.ok, summary: item.summary ?? "" });
        if (tu.name === "write_file" || tu.name === "edit_file" || tu.name === "delete_file" || tu.name === "run_command" || tu.name === "install_package") {
          emit({ type: "changes", changes: structuredClone(changes) });
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: res.output, is_error: !res.ok });
      }
      if (controller.signal.aborted) break;
      messages.push({ role: "user", content: results });
      if (ctx.question) {
        // The model asked something: show it, end the run, and wait for the user's reply.
        const q = ctx.question;
        const line = `${text.trim() ? "\n\n" : ""}${q.question}`;
        text += line;
        emit({ type: "text", delta: line });
        emit({ type: "question", question: q.question, options: q.options });
        break;
      }
    }
  } catch (e) {
    if (controller.signal.aborted) {
      status = "STOPPED";
    } else if (e instanceof AIProviderError) {
      status = "ERROR";
      error = e.message;
    } else {
      console.error("[agent]", e);
      status = "ERROR";
      error = "Something went wrong while working on your project.";
    }
  }
  if (controller.signal.aborted) status = "STOPPED";
  finishRun(runId);

  // Pick up any changes made by commands and store a version.
  try {
    mergeChanges(changes, await syncFromDisk(input.projectId));
    if (changes.created.length || changes.changed.length || changes.deleted.length) {
      await createSnapshot(input.projectId, input.userMessage.slice(0, 100), "agent");
    }
  } catch (e) {
    console.error("[agent] post-run sync failed", e);
  }
  const info = previewInfo(input.projectId);
  emit({ type: "preview", status: info.status, url: info.url });

  let finalText = text.trim();
  if (!finalText && status !== "ERROR") {
    const touched = [...changes.created, ...changes.changed, ...changes.deleted];
    const doneSteps = activity.filter((a) => a.ok).map((a) => a.label.replace(/\.\.\.$/, ""));
    if (status === "STOPPED") finalText = touched.length ? `Stopped before finishing. Files changed so far: ${touched.slice(0, 8).join(", ")}${touched.length > 8 ? ", ..." : ""}.` : "Stopped before making changes.";
    else if (touched.length) finalText = `Done. Updated ${touched.slice(0, 8).join(", ")}${touched.length > 8 ? ` and ${touched.length - 8} more` : ""}.`;
    else if (doneSteps.length) finalText = `Done. ${doneSteps.slice(-3).join("; ")}.`;
  }
  return { text: finalText, activity, changes, usage, steps, status, error, durationMs: Date.now() - started };
}

function detailFor(name: string, input: unknown): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.path === "string") return i.path;
  if (typeof i.command === "string") return i.command.slice(0, 120);
  if (Array.isArray(i.packages)) return i.packages.join(", ");
  if (typeof i.query === "string") return i.query;
  return name === "get_project_errors" ? "checking for errors" : undefined;
}
