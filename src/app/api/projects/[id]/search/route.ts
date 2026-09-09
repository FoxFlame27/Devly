import { json } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { searchFiles } from "@/lib/projects/files";

export const GET = projectRoute(async (req, { project }) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ results: await searchFiles(project.id, q.slice(0, 200)) });
});
