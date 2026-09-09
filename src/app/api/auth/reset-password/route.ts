import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { assertSameOrigin, enforceRateLimit, handler, HttpError, json, parseBody } from "@/lib/http";
import { createSession, toSafeUser } from "@/lib/auth/session";
import { verifyChallenge } from "@/lib/auth/challenge";
import { verifySupabaseToken } from "@/lib/auth/supabase-server";

const schema = z.object({
  password: z.string().min(8).max(200),
  accessToken: z.string().min(20).max(4096).optional(),
  challengeId: z.string().min(1).max(40).optional(),
  code: z.string().min(4).max(12).optional(),
});

/** Step 2 of "forgot password": the email is proven (Supabase token or emailed code), set the new password and sign in. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "reset-password", 30, 15 * 60 * 1000);
  const body = await parseBody(req, schema);
  let email: string | null = null;
  let userId: string | null = null;
  if (body.accessToken) email = (await verifySupabaseToken(body.accessToken)).email;
  else if (body.challengeId && body.code) userId = await verifyChallenge(body.challengeId, body.code);
  else throw new HttpError(400, "Missing verification.");
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : await db.user.findUnique({ where: { email: email! } });
  if (!user) throw new HttpError(404, "There's no account with that email. You can create one instead.", "no_account");
  if (user.disabled) throw new HttpError(403, "This account has been disabled.");
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  // Sign out other devices: the password changed.
  await db.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: toSafeUser(updated) });
});
