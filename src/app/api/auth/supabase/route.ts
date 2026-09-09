import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, randomToken } from "@/lib/crypto";
import { assertSameOrigin, enforceRateLimit, handler, HttpError, json, parseBody } from "@/lib/http";
import { createSession, toSafeUser } from "@/lib/auth/session";
import { verifySupabaseToken } from "@/lib/auth/supabase-server";

const schema = z.object({
  accessToken: z.string().min(20).max(4096),
  /** Password chosen at signup; only applied if the account doesn't have one yet */
  password: z.string().min(8).max(200).optional(),
});

/** Completes signup/login after a Supabase email OTP: verifies the token, then issues Devly's own session. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "supabase-verify", 200, 15 * 60 * 1000);
  const body = await parseBody(req, schema);
  const verified = await verifySupabaseToken(body.accessToken);
  let user = await db.user.findUnique({ where: { email: verified.email } });
  if (!user) {
    // First time we see this email (e.g. verified on another device): create the account now.
    user = await db.user.create({ data: { email: verified.email, passwordHash: await hashPassword(body.password ?? randomToken(32)), emailVerifiedAt: new Date() } });
  } else {
    if (user.disabled) throw new HttpError(403, "This account has been disabled.");
    user = await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  }
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: toSafeUser(user) });
});
