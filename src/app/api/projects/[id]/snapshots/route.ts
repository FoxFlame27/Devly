import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { createSnapshot, listSnapshots } from "@/lib/projects/snapshots";
import { syncFromDisk } from "@/lib/projects/files";

export const GET = projectRoute(async (_req, { project }) => json({ snapshots: await listSnapshots(project.id) }));

export const POST = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ label: z.string().trim().max(120).optional() }));
  await syncFromDisk(project.id);
  const r = await createSnapshot(project.id, body.label || "Saved", "manual");
  return json({ snapshot: r });
});
