import { z } from "zod";
import { db } from "@/lib/db";
import { enforceRateLimit, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { getAIProvider, AIProviderError, type AIMessage } from "@/lib/ai";
import { availableModels, resolveEffort } from "@/lib/ai/models";
import { buildProjectContext } from "@/lib/agent/context";
import { readFile } from "@/lib/projects/files";
import { collectPreviewErrors } from "@/lib/projects/preview";

const schema = z.object({
  message: z.string().trim().min(1).max(8000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(30).default([]),
  model: z.string().max(80).optional().nullable(),
  context: z.object({ tab: z.string().max(20).optional(), filePath: z.string().max(512).optional() }).optional(),
});

export const maxDuration = 300;

const SYSTEM = `You are the helper inside Devly, a website builder where people describe what they want and an AI builds it. The person is looking at their project right now. Answer questions, explain things simply, suggest ideas, and help them figure out what to ask the builder. You cannot edit files yourself; if they want a change made, say so and give the exact request they should send to the builder (or they can press "Do this in the project"). Keep answers short and plain. Do not paste large code unless asked.`;

/** Lightweight Q&A assistant (no tools). Knows the project and what the user is looking at. */
export const POST = projectRoute(async (req, { user, project }) => {
  enforceRateLimit(req, "ask", 60, 10 * 60 * 1000, user.id);
  const body = await parseBody(req, schema, 100_000);
  const models = availableModels();
  const model = body.model && models.some((m) => m.id === body.model) ? body.model : (models.find((m) => /^gemini/.test(m.id)) ?? models.find((m) => /mini|flash|haiku/.test(m.id)) ?? models[0])?.id;
  if (!model) return new Response("data: " + JSON.stringify({ type: "error", message: "No AI model is configured." }) + "\n\n", { headers: { "Content-Type": "text/event-stream" } });

  const parts: string[] = [await buildProjectContext(project.id, "")];
  const ctx = body.context ?? {};
  if (ctx.tab) parts.push(`The user is currently on the "${ctx.tab}" tab.`);
  if (ctx.filePath) {
    try {
      const f = await readFile(project.id, ctx.filePath);
      parts.push(`They have this file open: ${f.path}\n\`\`\`\n${f.content.slice(0, 12000)}\n\`\`\``);
    } catch {
      /* ignore */
    }
  }
  const errs = collectPreviewErrors(project.id);
  if (errs.problems.length) parts.push(`Current problems in the preview:\n${errs.problems.join("\n\n").slice(0, 3000)}`);

  const messages: AIMessage[] = [...body.history.map((h) => ({ role: h.role, content: h.content }) as AIMessage), { role: "user", content: body.message }];
  const encoder = new TextEncoder();
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (e: object) => {
        try {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* closed */
        }
      };
      try {
        const turn = await getAIProvider(model).streamTurn({
          model,
          effort: resolveEffort("low"),
          system: { stable: SYSTEM, dynamic: parts.join("\n\n") },
          messages,
          tools: [],
          maxTokens: 4000,
          signal: controller.signal,
          onText: (delta) => send({ type: "text", delta }),
        });
        await db.usage.create({ data: { userId: user.id, projectId: project.id, model, inputTokens: turn.usage.inputTokens, outputTokens: turn.usage.outputTokens, steps: 1, durationMs: Date.now() - started, status: "COMPLETED" } }).catch(() => {});
        send({ type: "done", model });
      } catch (e) {
        send({ type: "error", message: e instanceof AIProviderError ? e.message : "Something went wrong. Please try again." });
      } finally {
        try {
          ctrl.close();
        } catch {
          /* closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
});
