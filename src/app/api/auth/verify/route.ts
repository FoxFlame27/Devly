import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, enforceRateLimit, handler, json, parseBody } from "@/lib/http";
import { createSession, toSafeUser } from "@/lib/auth/session";
import { verifyChallenge } from "@/lib/auth/challenge";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "verify", 100, 15 * 60 * 1000);
  const body = await parseBody(req, z.object({ challengeId: z.string().min(1).max(40), code: z.string().min(4).max(12) }));
  const userId = await verifyChallenge(body.challengeId, body.code);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ user: toSafeUser(user) });
});
