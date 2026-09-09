import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { attachDomain, checkDomain, detachDomain } from "@/lib/projects/deploy";

export const GET = projectRoute(async (_req, { project, user }) => json({ status: await checkDomain(project.id, user.id) }));

export const POST = projectRoute(async (req, { project, user }) => {
  const body = await parseBody(req, z.object({ domain: z.string().trim().min(3).max(253) }));
  return json({ status: await attachDomain(project.id, user.id, body.domain) });
});

export const DELETE = projectRoute(async (_req, { project, user }) => {
  await detachDomain(project.id, user.id);
  return json({ ok: true });
});
