import { decrypt } from "@/lib/crypto";
import { HttpError, json } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { listRepos } from "@/lib/github";

export const GET = authedRoute(async (_req, { user }) => {
  if (!user.githubToken) throw new HttpError(400, "Connect GitHub first (Settings).", "github_token");
  return json({ repos: await listRepos(decrypt(user.githubToken)) });
});
