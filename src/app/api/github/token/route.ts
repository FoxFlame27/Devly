import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { HttpError, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { githubUser } from "@/lib/github";

/** The user's GitHub token: stored encrypted, never returned. */
export const GET = authedRoute(async (_req, { user }) => {
  if (!user.githubToken) return json({ connected: false });
  try {
    const u = await githubUser(decrypt(user.githubToken));
    return json({ connected: true, login: u.login, avatar: u.avatar_url });
  } catch {
    return json({ connected: false, invalid: true });
  }
});

export const PUT = authedRoute(async (req, { user }) => {
  const body = await parseBody(req, z.object({ token: z.string().trim().min(20).max(400) }));
  let login: string;
  try {
    login = (await githubUser(body.token)).login;
  } catch {
    throw new HttpError(400, "GitHub didn't accept that token. Check it and try again.");
  }
  await db.user.update({ where: { id: user.id }, data: { githubToken: encrypt(body.token) } });
  return json({ connected: true, login });
});

export const DELETE = authedRoute(async (_req, { user }) => {
  await db.user.update({ where: { id: user.id }, data: { githubToken: null } });
  return json({ connected: false });
});
