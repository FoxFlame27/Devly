import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, enforceRateLimit, handler, json, parseBody } from "@/lib/http";
import { maskEmail, startChallenge } from "@/lib/auth/challenge";
import { supabaseServerConfigured } from "@/lib/auth/supabase-server";

/** Step 1 of "forgot password": send a code to the email. Never reveals whether an account exists. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "forgot", 30, 15 * 60 * 1000);
  const body = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email().max(200) }));
  if (supabaseServerConfigured()) {
    // The browser asks Supabase to email the code (same as signup/login).
    return json({ verify: { provider: "supabase", email: body.email, masked: maskEmail(body.email) } });
  }
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user) return json({ verify: { challengeId: "none", email: body.email, masked: maskEmail(body.email) } });
  const ch = await startChallenge(user);
  return json({ verify: { challengeId: ch.challengeId, email: body.email, masked: maskEmail(body.email), devCode: ch.devCode } });
});
