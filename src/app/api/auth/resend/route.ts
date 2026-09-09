import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, enforceRateLimit, handler, HttpError, json, parseBody } from "@/lib/http";
import { maskEmail, startChallenge } from "@/lib/auth/challenge";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "resend", 30, 15 * 60 * 1000);
  const body = await parseBody(req, z.object({ challengeId: z.string().min(1).max(40) }));
  const ch = await db.loginChallenge.findUnique({ where: { id: body.challengeId }, include: { user: true } });
  if (!ch) throw new HttpError(400, "Please sign in again.", "challenge_expired");
  const next = await startChallenge(ch.user);
  return json({ verify: { challengeId: next.challengeId, email: maskEmail(ch.user.email), devCode: next.devCode, devReason: next.devReason } });
});
