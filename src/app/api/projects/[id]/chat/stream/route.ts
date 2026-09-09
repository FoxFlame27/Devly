import { HttpError } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { channelInfo, subscribe } from "@/lib/agent/registry";
import { encodeSse } from "@/lib/agent/events";

export const maxDuration = 300;

/** Re-attaches to a run: replays everything so far, then streams live until it finishes. */
export const GET = projectRoute(async (req, { project }) => {
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  const info = channelInfo(runId);
  if (!info || info.projectId !== project.id) throw new HttpError(404, "That run is no longer available.");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          ctrl.close();
        } catch {
          /* closed */
        }
      };
      const heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          close();
        }
      }, 15000);
      const unsub = subscribe(runId, (e) => {
        if (closed) return;
        try {
          ctrl.enqueue(encoder.encode(encodeSse(e)));
        } catch {
          closed = true;
        }
        if (e.type === "done") close();
      });
      if (!unsub) close();
      req.signal.addEventListener("abort", () => {
        unsub?.();
        close();
      });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
});
