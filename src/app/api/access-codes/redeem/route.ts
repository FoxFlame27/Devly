import { z } from "zod";
import { db } from "@/lib/db";
import { enforceRateLimit, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { redeemAccessCode } from "@/lib/access-codes";
import { toSafeUser } from "@/lib/auth/session";

export const POST = authedRoute(async (req, { user }) => {
  // Tight limits make guessing codes impractical.
  enforceRateLimit(req, "redeem-ip", 15, 15 * 60 * 1000);
  enforceRateLimit(req, "redeem-user", 8, 15 * 60 * 1000, user.id);
  const body = await parseBody(req, z.object({ code: z.string().min(4).max(40) }));
  const result = await redeemAccessCode(user.id, body.code);
  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return json({ result, user: toSafeUser(fresh) });
});
