import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { enforceRateLimit, HttpError, json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { pushFiles } from "@/lib/github";
import { listFiles, readFile, syncFromDisk } from "@/lib/projects/files";

export const maxDuration = 120;

/** Pushes the whole project (all stored text files) as one commit. */
export const POST = projectRoute(async (req, { project, user }) => {
  enforceRateLimit(req, "gh-push", 30, 10 * 60 * 1000, user.id);
  if (!user.githubToken) throw new HttpError(400, "Add your GitHub token first.", "github_token");
  if (!project.githubRepo) throw new HttpError(400, "Connect a repository first.", "github_repo");
  const body = await parseBody(req, z.object({ message: z.string().trim().max(200).optional() }));
  await syncFromDisk(project.id).catch(() => {});
  const entries = await listFiles(project.id);
  const files = [];
  for (const e of entries) {
    if (/(^|\/)(node_modules|\.git|dist|\.next|\.vite)(\/|$)/.test(e.path)) continue;
    const f = await readFile(project.id, e.path);
    files.push({ path: f.path, content: f.content });
  }
  if (!files.length) throw new HttpError(400, "There are no files to push yet.");
  const result = await pushFiles(decrypt(user.githubToken), project.githubRepo, project.githubBranch ?? "main", files, body.message || `Update from Devly (${new Date().toISOString().slice(0, 16).replace("T", " ")})`);
  await db.project.update({ where: { id: project.id }, data: { githubLastSha: result.sha, githubSyncedAt: new Date() } });
  return json({ ok: true, sha: result.sha, url: result.url, files: files.length });
});
