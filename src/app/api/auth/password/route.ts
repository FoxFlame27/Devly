import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword, hmac, verifyPassword } from "@/lib/crypto";
import { assertSameOrigin, enforceRateLimit, HttpError, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { SESSION_COOKIE } from "@/lib/auth/session";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(8).max(200) });

/** Change password for a signed-in user. Every other device is signed out; this browser stays in. */
export const POST = authedRoute(async (req, { user }) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "change-password", 10, 15 * 60 * 1000, user.id);
  const body = await parseBody(req, schema);
  if (!(await verifyPassword(body.current, user.passwordHash))) throw new HttpError(400, 'The current password is wrong. If you signed up with Google, use "Forgot password" on the login page to set one.');
  if (body.current === body.next) throw new HttpError(400, "The new password must be different from the current one.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId: user.id, ...(token ? { NOT: { tokenHash: hmac(token) } } : {}) } });
  return json({ ok: true });
});
