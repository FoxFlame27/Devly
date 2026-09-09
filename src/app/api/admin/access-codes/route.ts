import { z } from "zod";
import { db } from "@/lib/db";
import { json, parseBody } from "@/lib/http";
import { adminRoute } from "@/lib/api/admin-route";
import { createAccessCode } from "@/lib/access-codes";

export const GET = adminRoute(async () => {
  const codes = await db.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, hint: true, label: true, type: true, prompts: true, maxRedemptions: true, redemptionCount: true, expiresAt: true, disabled: true, createdAt: true, createdBy: { select: { email: true } } },
  });
  return json({ codes });
});

const createSchema = z.object({
  type: z.enum(["PROMPTS", "UNLIMITED"]),
  prompts: z.number().int().min(1).max(100_000).optional(),
  maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  label: z.string().trim().max(80).nullable().optional(),
  code: z.string().trim().min(6).max(32).optional(),
});

export const POST = adminRoute(async (req, { admin }) => {
  const body = await parseBody(req, createSchema);
  const { record, plain } = await createAccessCode({
    type: body.type,
    prompts: body.prompts,
    maxRedemptions: body.maxRedemptions ?? null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    label: body.label ?? null,
    createdById: admin.id,
    code: body.code,
  });
  // The plain code is returned exactly once; only its hash is stored.
  return json({ code: plain, id: record.id }, { status: 201 });
});

export const PATCH = adminRoute(async (req) => {
  const body = await parseBody(req, z.object({ id: z.string().min(1).max(40), disabled: z.boolean() }));
  const code = await db.accessCode.update({ where: { id: body.id }, data: { disabled: body.disabled }, select: { id: true, disabled: true } });
  return json({ code });
});
