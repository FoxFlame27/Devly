import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { adminRoute } from "@/lib/api/admin-route";

export const GET = adminRoute(async () => {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, name: true, template: true, updatedAt: true, createdAt: true, publishedSlug: true, owner: { select: { email: true } }, _count: { select: { files: true, conversations: true } } },
  });
  return json({ projects });
});
