import { z } from "zod";
import { enforceRateLimit, HttpError, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { getSandbox } from "@/lib/sandbox";
import { CommandNotAllowed, validateCommand } from "@/lib/sandbox/commands";
import { projectEnv } from "@/lib/projects/env-vars";
import { materialize, syncFromDisk } from "@/lib/projects/files";

export const maxDuration = 300;

/** Runs a command in the project sandbox and streams its output as plain text. */
export const POST = projectRoute(async (req, { user, project }) => {
  enforceRateLimit(req, "terminal", 60, 10 * 60 * 1000, user.id);
  const body = await parseBody(req, z.object({ command: z.string().min(1).max(2000) }));
  let cmd: string;
  try {
    cmd = validateCommand(body.command);
  } catch (e) {
    throw new HttpError(400, e instanceof CommandNotAllowed ? e.message : "Command not allowed.");
  }
  await materialize(project.id);
  const env = await projectEnv(project.id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const write = (s: string) => {
        try {
          ctrl.enqueue(encoder.encode(s));
        } catch {
          /* closed */
        }
      };
      const r = await getSandbox().exec(project.id, cmd, { timeoutMs: 180_000, env, signal: req.signal, onOutput: (chunk) => write(chunk) });
      await syncFromDisk(project.id);
      write(`\n[exit ${r.exitCode ?? "?"}${r.timedOut ? ", timed out" : ""}]\n`);
      try {
        ctrl.close();
      } catch {
        /* closed */
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
});
