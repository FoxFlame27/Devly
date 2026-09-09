import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { activeChannelForProject } from "@/lib/agent/registry";

/** Tells the browser whether the AI is still working on this project, so it can re-attach after navigating away. */
export const GET = projectRoute(async (_req, { project }) => {
  const run = activeChannelForProject(project.id);
  return json({ run: run ? { runId: run.runId, conversationId: run.conversationId, messageId: run.messageId, startedAt: run.startedAt } : null });
});
