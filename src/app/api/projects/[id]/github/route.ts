import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { HttpError, json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { createRepo, repoInfo } from "@/lib/github";

function status(p: { githubRepo: string | null; githubBranch: string | null; githubLastSha: string | null; githubSyncedAt: Date | null }) {
  return { repo: p.githubRepo, branch: p.githubBranch ?? "main", lastSha: p.githubLastSha, syncedAt: p.githubSyncedAt, url: p.githubRepo ? `https://github.com/${p.githubRepo}` : null };
}

export const GET = projectRoute(async (_req, { project, user }) => json({ github: status(project), tokenConnected: !!user.githubToken }));

const schema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
  branch: z.string().regex(/^[\w./-]{1,100}$/).optional(),
  create: z.object({ name: z.string().regex(/^[\w.-]{1,100}$/), private: z.boolean().default(true) }).optional(),
});

/** Connects the project to a repository (existing, or newly created). */
export const POST = projectRoute(async (req, { project, user }) => {
  if (!user.githubToken) throw new HttpError(400, "Add your GitHub token first.", "github_token");
  const token = decrypt(user.githubToken);
  const body = await parseBody(req, schema);
  let repo = body.repo;
  let branch = body.branch;
  if (body.create) {
    const r = await createRepo(token, body.create.name, body.create.private);
    repo = r.full_name;
    branch = branch ?? r.default_branch;
  } else if (repo) {
    const info = await repoInfo(token, repo);
    if (info.permissions && info.permissions.push === false) throw new HttpError(403, "The token can't push to that repository.");
    branch = branch ?? info.default_branch;
  } else throw new HttpError(400, "Pick a repository or create one.");
  const updated = await db.project.update({ where: { id: project.id }, data: { githubRepo: repo, githubBranch: branch ?? "main", githubLastSha: null, githubSyncedAt: null } });
  return json({ github: status(updated) });
});

export const DELETE = projectRoute(async (_req, { project }) => {
  const updated = await db.project.update({ where: { id: project.id }, data: { githubRepo: null, githubLastSha: null, githubSyncedAt: null } });
  return json({ github: status(updated) });
});
