import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { ensureRunning, previewInfo, startPreview, stopPreview } from "@/lib/projects/preview";

export const maxDuration = 300;

export const GET = projectRoute(async (_req, { project }) => json({ preview: previewInfo(project.id) }));

export const POST = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ action: z.enum(["start", "stop", "restart"]) }));
  if (body.action === "stop") {
    await stopPreview(project.id);
    return json({ preview: previewInfo(project.id) });
  }
  const info = body.action === "restart" ? await startPreview(project.id) : await ensureRunning(project.id);
  return json({ preview: info });
});
