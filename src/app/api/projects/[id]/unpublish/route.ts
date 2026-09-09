import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { getHosting } from "@/lib/hosting";

export const POST = projectRoute(async (_req, { project }) => {
  if (project.publishedSlug) await getHosting().unpublish(project.publishedSlug).catch(() => {});
  await db.project.update({ where: { id: project.id }, data: { publishedSlug: null, publishedAt: null } });
  return json({ ok: true });
});
