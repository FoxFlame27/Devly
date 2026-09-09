import { z } from "zod";
import { db } from "@/lib/db";
import { isServerless } from "@/lib/serverless";
import { enforceRateLimit, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { createProject } from "@/lib/projects/service";

const createSchema = z.object({
  prompt: z.string().trim().max(4000).optional(),
  name: z.string().trim().max(80).optional(),
  template: z.enum(["website", "react", "nextjs", "static"]).nullable().optional(),
});

export const GET = authedRoute(async (_req, { user }) => {
  const projects = await db.project.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, template: true, updatedAt: true, createdAt: true, publishedSlug: true, publishedAt: true },
  });
  return json({ projects });
});

export const POST = authedRoute(async (req, { user }) => {
  enforceRateLimit(req, "create-project", 20, 60 * 60 * 1000, user.id);
  const body = await parseBody(req, createSchema);
  // Serverless hosts can't run dev servers or builds: every project there is a plain HTML site.
  const project = await createProject(user.id, isServerless() ? { ...body, template: "static" } : body);
  return json({ project: { id: project.id, name: project.name, template: project.template } }, { status: 201 });
});
