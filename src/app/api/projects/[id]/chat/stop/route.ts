import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { stopRun } from "@/lib/agent/registry";

export const POST = projectRoute(async (req, { user }) => {
  const body = await parseBody(req, z.object({ runId: z.string().uuid() }));
  return json({ stopped: stopRun(body.runId, user.id) });
});
