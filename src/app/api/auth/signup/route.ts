import { db } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { assertSameOrigin, enforceRateLimit, handler, HttpError, json, parseBody } from "@/lib/http";
import { signupSchema } from "@/lib/auth/validation";
import { createSession, toSafeUser } from "@/lib/auth/session";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "signup", 10, 60 * 60 * 1000);
  const body = await parseBody(req, signupSchema);
  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, "An account with that email already exists. Try signing in.");
  const user = await db.user.create({ data: { email: body.email, passwordHash: await hashPassword(body.password), name: body.name || null } });
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: toSafeUser(user) }, { status: 201 });
});
