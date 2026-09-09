import { z } from "zod";
import { db } from "@/lib/db";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { deleteProject } from "@/lib/projects/service";
import { siteOrigin } from "@/lib/hosting/local";
import { getHosting } from "@/lib/hosting";

export const GET = projectRoute(async (_req, { project }) => {
  await db.project.update({ where: { id: project.id }, data: { lastOpenedAt: new Date() } });
  return json({
    project: {
      id: project.id,
      name: project.name,
      template: project.template,
      description: project.description,
      updatedAt: project.updatedAt,
      publishedUrl: project.publishedSlug ? `${siteOrigin()}${getHosting().basePath(project.publishedSlug).replace(/\/$/, "")}` : null,
      publishedAt: project.publishedAt,
    },
  });
});

export const PATCH = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));
  const updated = await db.project.update({ where: { id: project.id }, data: { name: body.name } });
  return json({ project: { id: updated.id, name: updated.name } });
});

export const DELETE = projectRoute(async (_req, { project }) => {
  await deleteProject(project.id);
  return json({ ok: true });
});
