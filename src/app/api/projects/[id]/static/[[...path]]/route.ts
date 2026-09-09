import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { serveProjectFile } from "@/lib/projects/static-site";

/** Live preview for plain HTML/CSS/JS projects: files served directly from the database. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path: parts = [] } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const project = await db.project.findFirst({ where: { id, ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) }, select: { id: true } });
  if (!project) return new Response("Not found", { status: 404 });
  return serveProjectFile(project.id, parts, { base: `/api/projects/${project.id}/static/` });
}
