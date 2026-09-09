import { randomUUID } from "node:crypto";
import { z } from "zod";
import { after } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit, HttpError, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { consumePrompt, promptsRemaining, refundPrompt } from "@/lib/usage";
import { resolveEffort, resolveModel } from "@/lib/ai/models";
import { runAgent } from "@/lib/agent/runner";
import { encodeSse, type AgentEvent } from "@/lib/agent/events";
import { activeRunForProject, openChannel, publish } from "@/lib/agent/registry";
import { materialize } from "@/lib/projects/files";
import { isUnlimited } from "@/lib/auth/session";

const schema = z.object({
  message: z.string().trim().min(1).max(20_000),
  attachments: z
    .array(z.object({ name: z.string().max(120), type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), data: z.string().regex(/^[A-Za-z0-9+/=]+$/).max(4_000_000) }))
    .max(4)
    .optional(),
  conversationId: z.string().max(40).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  effort: z.string().max(10).optional().nullable(),
});

export const maxDuration = 300;

export const POST = projectRoute(async (req, { user, project }) => {
  enforceRateLimit(req, "chat", 30, 10 * 60 * 1000, user.id);
  const body = await parseBody(req, schema, 17_000_000);
  if (activeRunForProject(project.id)) throw new HttpError(409, "The AI is still working on this project. Stop it first or wait for it to finish.", "busy");

  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const c = await db.conversation.findFirst({ where: { id: conversationId, projectId: project.id } });
    if (!c) throw new HttpError(404, "Conversation not found.");
  } else {
    const c = await db.conversation.create({ data: { projectId: project.id, userId: user.id, title: body.message.slice(0, 60) } });
    conversationId = c.id;
  }
  const model = resolveModel(body.model);
  const effort = resolveEffort(body.effort);

  // Enforce the prompt limit server-side before doing any work.
  await consumePrompt(user);

  const userMsg = await db.message.create({ data: { conversationId, role: "USER", content: body.message, attachments: body.attachments?.length ? body.attachments : undefined } });
  const assistantMsg = await db.message.create({ data: { conversationId, role: "ASSISTANT", content: "", status: "COMPLETE", model } });
  await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await materialize(project.id);

  const runId = randomUUID();
  const controller = new AbortController();
  const encoder = new TextEncoder();
  const cid = conversationId;
  openChannel(runId, { projectId: project.id, userId: user.id, conversationId: cid, messageId: assistantMsg.id });

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let closed = false;
      const send = (e: AgentEvent) => {
        publish(runId, e);
        if (closed) return;
        try {
          ctrl.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            ctrl.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 15000);
      send({ type: "run", runId, conversationId: cid, messageId: assistantMsg.id });

      let finished!: () => void;
      const done = new Promise<void>((r) => (finished = r));
      after(() => done); // serverless hosts: don't freeze the function when the stream is cancelled
      (async () => {
        const result = await runAgent({
          projectId: project.id,
          template: project.template,
          conversationId: cid,
          userId: user.id,
          model,
          effort,
          unlimited: isUnlimited(user),
          userMessage: body.message,
          attachments: body.attachments,
          runId,
          controller,
          emit: send,
        });
        const didWork = result.steps > 0 && (result.text.length > 0 || result.activity.length > 0);
        if (result.status === "ERROR" && !didWork) await refundPrompt(user);
        await db.message.update({
          where: { id: assistantMsg.id },
          data: {
            content: result.text,
            activity: result.activity as object[],
            changes: result.changes,
            status: result.status,
          },
        });
        await db.usage.create({
          data: {
            userId: user.id,
            projectId: project.id,
            conversationId: cid,
            model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            steps: result.steps,
            durationMs: result.durationMs,
            status: result.status === "COMPLETE" ? "COMPLETED" : result.status === "STOPPED" ? "STOPPED" : "FAILED",
          },
        });
        const fresh = await db.user.findUnique({ where: { id: user.id } });
        if (result.status === "ERROR" && result.error) send({ type: "error", message: result.error, retryable: true });
        send({ type: "done", messageId: assistantMsg.id, changes: result.changes, promptsRemaining: fresh ? promptsRemaining(fresh) : null, stopped: result.status === "STOPPED" });
        clearInterval(heartbeat);
        closed = true;
        try {
          ctrl.close();
        } catch {
          /* closed */
        }
      })().finally(() => finished()).catch((e) => {
        console.error("[chat] run failed", e);
        send({ type: "error", message: "Something went wrong. Please try again.", retryable: true });
        clearInterval(heartbeat);
        closed = true;
        try {
          ctrl.close();
        } catch {
          /* closed */
        }
      });
    },
    cancel() {
      // Browser went away: keep the agent running so the project is left in a consistent state,
      // the user can Stop explicitly.
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
