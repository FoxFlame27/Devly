import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { materialize, syncFromDisk } from "@/lib/projects/files";

/** "Sync": reconciles the running workspace with the stored project in both directions. */
export const POST = projectRoute(async (_req, { project }) => {
  const changes = await syncFromDisk(project.id);
  await materialize(project.id);
  return json({ changes, syncedAt: new Date().toISOString() });
});
