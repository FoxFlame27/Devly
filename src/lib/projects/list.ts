import "server-only";
import { db } from "../db";
import type { ProjectSummary } from "../client/types";

export async function listUserProjects(userId: string, take = 50): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, name: true, template: true, updatedAt: true, createdAt: true, publishedSlug: true, publishedAt: true },
  });
  return rows.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt.toISOString(), publishedAt: p.publishedAt?.toISOString() ?? null }));
}
