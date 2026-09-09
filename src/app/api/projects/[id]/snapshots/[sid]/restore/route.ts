import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { restoreSnapshot } from "@/lib/projects/snapshots";
import { previewInfo, startPreview } from "@/lib/projects/preview";

export const POST = projectRoute(async (_req, { project, params }) => {
  const r = await restoreSnapshot(project.id, params.sid);
  if (previewInfo(project.id).status === "running") startPreview(project.id).catch(() => {});
  return json({ restored: r });
});
