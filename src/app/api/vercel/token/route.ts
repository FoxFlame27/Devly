import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { HttpError, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { vercelUser } from "@/lib/vercel";

/** The user's Vercel token for hosting: stored encrypted, never returned. */
export const GET = authedRoute(async (_req, { user }) => {
  if (!user.vercelToken) return json({ connected: false });
  try {
    const u = await vercelUser(decrypt(user.vercelToken));
    return json({ connected: true, username: u.username });
  } catch {
    return json({ connected: false, invalid: true });
  }
});

export const PUT = authedRoute(async (req, { user }) => {
  const body = await parseBody(req, z.object({ token: z.string().trim().min(20).max(400) }));
  let username: string;
  try {
    username = (await vercelUser(body.token)).username;
  } catch {
    throw new HttpError(400, "Vercel didn't accept that token. Check it and try again.");
  }
  await db.user.update({ where: { id: user.id }, data: { vercelToken: encrypt(body.token) } });
  return json({ connected: true, username });
});

export const DELETE = authedRoute(async (_req, { user }) => {
  await db.user.update({ where: { id: user.id }, data: { vercelToken: null } });
  return json({ connected: false });
});
