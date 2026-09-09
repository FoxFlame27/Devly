import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, json, parseBody } from "@/lib/http";
import { adminRoute } from "@/lib/api/admin-route";

export const GET = adminRoute(async (req) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const users = await db.user.findMany({
    where: q ? { email: { contains: q } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, email: true, name: true, role: true, promptsUsed: true, promptLimit: true, unlimited: true, unlimitedUntil: true, disabled: true, createdAt: true,
      _count: { select: { projects: true, usages: true } },
    },
  });
  return json({ users });
});

const patchSchema = z.object({
  userId: z.string().min(1).max(40),
  promptLimit: z.number().int().min(0).max(1_000_000).optional(),
  promptsUsed: z.number().int().min(0).max(1_000_000).optional(),
  unlimited: z.boolean().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  disabled: z.boolean().optional(),
});

export const PATCH = adminRoute(async (req, { admin }) => {
  const body = await parseBody(req, patchSchema);
  if (body.userId === admin.id && (body.role === "USER" || body.disabled)) throw new HttpError(400, "You can't demote or disable yourself.");
  const { userId, ...data } = body;
  const user = await db.user.update({ where: { id: userId }, data, select: { id: true, promptLimit: true, promptsUsed: true, unlimited: true, role: true, disabled: true } });
  return json({ user });
});
