import { enforceRateLimit, json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { publishProject } from "@/lib/projects/publish";

export const maxDuration = 300;

export const POST = projectRoute(async (req, { user, project }) => {
  enforceRateLimit(req, "publish", 10, 10 * 60 * 1000, user.id);
  const result = await publishProject(project.id);
  return json(result, { status: result.ok ? 200 : 422 });
});
