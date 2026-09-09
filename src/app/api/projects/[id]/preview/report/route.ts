import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { reportRuntimeError } from "@/lib/projects/preview";

const schema = z.object({
  kind: z.enum(["error", "compile", "clear", "ready"]),
  message: z.string().max(2000).optional(),
  stack: z.string().max(4000).optional(),
});

export const POST = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, schema, 20_000);
  if (body.kind === "clear" || body.kind === "ready") reportRuntimeError(project.id, { kind: body.kind });
  else reportRuntimeError(project.id, { kind: body.kind, message: body.message ?? "Unknown error", stack: body.stack });
  return json({ ok: true });
});
