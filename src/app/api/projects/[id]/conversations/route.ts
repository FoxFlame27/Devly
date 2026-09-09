import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";

export const GET = projectRoute(async (_req, { project }) => {
  const conversations = await db.conversation.findMany({
    where: { projectId: project.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    take: 100,
  });
  return json({ conversations: conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c._count.messages })) });
});

export const POST = projectRoute(async (_req, { project, user }) => {
  const c = await db.conversation.create({ data: { projectId: project.id, userId: user.id } });
  return json({ conversation: { id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: 0 } }, { status: 201 });
});
