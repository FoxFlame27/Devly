import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { syncFromDisk } from "@/lib/projects/files";
import { createSnapshot } from "@/lib/projects/snapshots";

/** "Save": makes sure everything on disk is stored and records a version. */
export const POST = projectRoute(async (_req, { project }) => {
  const changes = await syncFromDisk(project.id);
  const snap = await createSnapshot(project.id, "Saved", "manual");
  return json({ changes, snapshot: snap, savedAt: new Date().toISOString() });
});
