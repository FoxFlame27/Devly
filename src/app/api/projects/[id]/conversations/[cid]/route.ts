import { db } from "@/lib/db";
import { HttpError, json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";

export const GET = projectRoute(async (_req, { project, params }) => {
  const c = await db.conversation.findFirst({ where: { id: params.cid, projectId: project.id } });
  if (!c) throw new HttpError(404, "Conversation not found.");
  const messages = await db.message.findMany({
    where: { conversationId: c.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, activity: true, changes: true, status: true, createdAt: true },
    take: 500,
  });
  return json({ conversation: { id: c.id, title: c.title }, messages });
});

export const DELETE = projectRoute(async (_req, { project, params }) => {
  const r = await db.conversation.deleteMany({ where: { id: params.cid, projectId: project.id } });
  if (!r.count) throw new HttpError(404, "Conversation not found.");
  return json({ ok: true });
});
