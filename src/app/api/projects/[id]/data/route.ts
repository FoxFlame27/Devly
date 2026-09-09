import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";

/** Read-only view of everything stored for this project (its slice of the platform database). */
export const GET = projectRoute(async (req, { project }) => {
  const table = new URL(req.url).searchParams.get("table") ?? "files";
  const take = 200;
  switch (table) {
    case "files": {
      const rows = await db.projectFile.findMany({ where: { projectId: project.id }, orderBy: { path: "asc" }, take: 2000, select: { id: true, path: true, size: true, hash: true, updatedAt: true } });
      return json({ columns: ["path", "size", "hash", "updatedAt"], rows: rows.map((r) => ({ ...r, hash: r.hash.slice(0, 12) })) });
    }
    case "conversations": {
      const rows = await db.conversation.findMany({ where: { projectId: project.id }, orderBy: { updatedAt: "desc" }, take, select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } } });
      return json({ columns: ["id", "title", "messages", "createdAt", "updatedAt"], rows: rows.map((r) => ({ id: r.id, title: r.title, messages: r._count.messages, createdAt: r.createdAt, updatedAt: r.updatedAt })) });
    }
    case "messages": {
      const rows = await db.message.findMany({ where: { conversation: { projectId: project.id } }, orderBy: { createdAt: "desc" }, take, select: { id: true, conversationId: true, role: true, status: true, model: true, content: true, createdAt: true } });
      return json({ columns: ["id", "role", "status", "model", "content", "createdAt"], rows: rows.map((r) => ({ ...r, content: r.content.slice(0, 200) })) });
    }
    case "versions": {
      const rows = await db.snapshot.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take, select: { id: true, label: true, trigger: true, fileCount: true, createdAt: true } });
      return json({ columns: ["id", "label", "trigger", "fileCount", "createdAt"], rows });
    }
    case "secrets": {
      const rows = await db.projectEnvironment.findMany({ where: { projectId: project.id }, orderBy: { key: "asc" }, select: { id: true, key: true, createdAt: true, updatedAt: true } });
      return json({ columns: ["key", "createdAt", "updatedAt"], rows: rows.map((r) => ({ ...r, value: "(encrypted)" })) });
    }
    case "usage": {
      const rows = await db.usage.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take, select: { id: true, model: true, inputTokens: true, outputTokens: true, steps: true, durationMs: true, status: true, createdAt: true } });
      return json({ columns: ["model", "inputTokens", "outputTokens", "steps", "durationMs", "status", "createdAt"], rows });
    }
    default:
      return json({ columns: [], rows: [] });
  }
});
