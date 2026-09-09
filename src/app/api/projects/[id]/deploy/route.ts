import { enforceRateLimit, json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { deployToVercel } from "@/lib/projects/deploy";

export const maxDuration = 300;

/** Deploys the project to the user's Vercel account; streams progress lines, then the result. */
export const POST = projectRoute(async (req, { project, user }) => {
  enforceRateLimit(req, "deploy", 20, 60 * 60 * 1000, user.id);
  const encoder = new TextEncoder();
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
        const r = await deployToVercel(project.id, user.id, (m) => send({ type: "status", text: m }), req.signal);
        if (r.ok) send({ type: "done", url: r.url, name: r.name });
        else send({ type: "error", message: r.error, logs: r.logs });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Deploy failed." });
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

export const GET = projectRoute(async (_req, { project, user }) => json({ hosting: { url: project.vercelUrl, name: project.vercelProjectName, deployedAt: project.deployedAt, customDomain: project.customDomain }, tokenConnected: !!user.vercelToken }));
