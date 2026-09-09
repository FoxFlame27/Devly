import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { previewLogs } from "@/lib/projects/preview";

export const GET = projectRoute(async (_req, { project }) => json({ logs: previewLogs(project.id) }));
