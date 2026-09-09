import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { assertSameOrigin, enforceRateLimit, handler, HttpError, json, parseBody } from "@/lib/http";
import { loginSchema } from "@/lib/auth/validation";
import { createSession, toSafeUser } from "@/lib/auth/session";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "login", 20, 15 * 60 * 1000);
  const body = await parseBody(req, loginSchema);
  enforceRateLimit(req, "login-email", 10, 15 * 60 * 1000, body.email);
  const user = await db.user.findUnique({ where: { email: body.email } });
  const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "Wrong email or password.");
  if (user.disabled) throw new HttpError(403, "This account has been disabled.");
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: toSafeUser(user) });
});
