import "server-only";
import type { AccessCodeType } from "@prisma/client";
import { db } from "./db";
import { hmac, randomToken } from "./crypto";
import { HttpError } from "./http";

export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function generateCode(): string {
  // 12 chars from an unambiguous alphabet => ~62 bits of entropy
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = Buffer.from(randomToken(24), "base64url");
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export async function createAccessCode(opts: {
  code?: string;
  type: AccessCodeType;
  prompts?: number;
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  label?: string | null;
  createdById?: string | null;
}) {
  const plain = opts.code ? normalizeCode(opts.code) : normalizeCode(generateCode());
  if (plain.length < 6 || plain.length > 32) throw new HttpError(400, "Code must be 6-32 characters.");
  const record = await db.accessCode.create({
    data: {
      codeHash: hmac(plain),
      hint: plain.slice(-2),
      type: opts.type,
      prompts: opts.type === "PROMPTS" ? Math.max(1, opts.prompts ?? 10) : 0,
      maxRedemptions: opts.maxRedemptions ?? null,
      expiresAt: opts.expiresAt ?? null,
      label: opts.label ?? null,
      createdById: opts.createdById ?? null,
    },
  });
  return { record, plain };
}

/** Redeems a code for a user. All checks happen inside one transaction. */
export async function redeemAccessCode(userId: string, raw: string) {
  const plain = normalizeCode(raw);
  if (plain.length < 4 || plain.length > 40) throw new HttpError(400, "That code doesn't look right.");
  const codeHash = hmac(plain);

  return db.$transaction(async (tx) => {
    const code = await tx.accessCode.findUnique({ where: { codeHash } });
    if (!code || code.disabled) throw new HttpError(400, "That code isn't valid.", "invalid_code");
    if (code.expiresAt && code.expiresAt.getTime() < Date.now()) throw new HttpError(400, "That code has expired.", "expired_code");
    if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions)
      throw new HttpError(400, "That code has already been used.", "used_code");
    const already = await tx.accessCodeRedemption.findUnique({ where: { codeId_userId: { codeId: code.id, userId } } });
    if (already) throw new HttpError(400, "You've already used this code.", "already_redeemed");

    await tx.accessCodeRedemption.create({ data: { codeId: code.id, userId } });
    await tx.accessCode.update({ where: { id: code.id }, data: { redemptionCount: { increment: 1 } } });

    if (code.type === "UNLIMITED") {
      await tx.user.update({ where: { id: userId }, data: { unlimited: true, unlimitedUntil: code.expiresAt ?? null } });
      return { type: "UNLIMITED" as const, prompts: 0 };
    }
    await tx.user.update({ where: { id: userId }, data: { promptLimit: { increment: code.prompts } } });
    return { type: "PROMPTS" as const, prompts: code.prompts };
  });
}
