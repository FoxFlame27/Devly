import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { deleteEnvVar, listEnvKeys, setEnvVar } from "@/lib/projects/env-vars";

export const GET = projectRoute(async (_req, { project }) => json({ variables: await listEnvKeys(project.id) }));

export const PUT = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ key: z.string().min(1).max(64), value: z.string().max(8000) }));
  await setEnvVar(project.id, body.key, body.value);
  return json({ variables: await listEnvKeys(project.id) });
});

export const DELETE = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ key: z.string().min(1).max(64) }));
  await deleteEnvVar(project.id, body.key);
  return json({ variables: await listEnvKeys(project.id) });
});
