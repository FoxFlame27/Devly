import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { enforceRateLimit, HttpError, json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { pullFiles } from "@/lib/github";
import { deleteFile, listFiles, readFile, writeFile } from "@/lib/projects/files";
import { createSnapshot } from "@/lib/projects/snapshots";

export const maxDuration = 120;

/** Replaces the project's files with the branch contents (a version is saved first so it can be undone). */
export const POST = projectRoute(async (req, { project, user }) => {
  enforceRateLimit(req, "gh-pull", 30, 10 * 60 * 1000, user.id);
  if (!user.githubToken) throw new HttpError(400, "Add your GitHub token first.", "github_token");
  if (!project.githubRepo) throw new HttpError(400, "Connect a repository first.", "github_repo");
  const body = await parseBody(req, z.object({ deleteMissing: z.boolean().default(true) }));
  const { files, sha, skipped } = await pullFiles(decrypt(user.githubToken), project.githubRepo, project.githubBranch ?? "main");
  await createSnapshot(project.id, "Before pulling from GitHub", "manual").catch(() => {});
  const existing = await listFiles(project.id);
  const incoming = new Set(files.map((f) => f.path));
  let changed = 0;
  let created = 0;
  let deleted = 0;
  for (const f of files) {
    const cur = existing.find((e) => e.path === f.path);
    if (cur) {
      const local = await readFile(project.id, f.path).catch(() => null);
      if (local && local.content === f.content) continue;
      await writeFile(project.id, f.path, f.content);
      changed++;
    } else {
      await writeFile(project.id, f.path, f.content);
      created++;
    }
  }
  if (body.deleteMissing) {
    for (const e of existing) {
      if (!incoming.has(e.path) && !/(^|\/)(node_modules|\.git|dist|\.next|\.vite)(\/|$)/.test(e.path) && !e.path.startsWith(".env")) {
        await deleteFile(project.id, e.path).catch(() => {});
        deleted++;
      }
    }
  }
  await db.project.update({ where: { id: project.id }, data: { githubLastSha: sha, githubSyncedAt: new Date() } });
  return json({ ok: true, sha, created, changed, deleted, skipped });
});
