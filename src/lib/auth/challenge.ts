import "server-only";
import { randomInt } from "node:crypto";
import { db } from "../db";
import { hmac } from "../crypto";
import { HttpError } from "../http";
import { getEmailProvider } from "../email";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

/** Creates a 6-digit code, emails it, and returns the challenge id (plus the code itself in dev/console mode). */
export async function startChallenge(user: { id: string; email: string; name: string | null }): Promise<{ challengeId: string; devCode?: string; devReason?: string }> {
  await db.loginChallenge.deleteMany({ where: { userId: user.id } });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ch = await db.loginChallenge.create({ data: { userId: user.id, codeHash: hmac(`${user.id}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  const provider = getEmailProvider();
  try {
    await provider.send({
    to: user.email,
    subject: `${code} is your Devly code`,
    text: `Your Devly sign-in code is ${code}. It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Your Devly sign-in code is</p><p style="font-size:32px;letter-spacing:6px;font-weight:600">${code}</p><p style="color:#666">It expires in 10 minutes. If you didn't try to sign in, ignore this email.</p></div>`,
    });
  } catch (e) {
    console.error("[email] send failed", e);
    const detail = e instanceof Error ? e.message : String(e);
    const testMode = /only send testing emails|verify a domain/i.test(detail);
    const msg = testMode
      ? "Sign-ups are temporarily limited while email delivery is being set up. Please try again later."
      : "We couldn't send the code to that email address right now. Please try again in a moment.";
    throw new HttpError(502, msg, "email_failed");
  }
  return { challengeId: ch.id, ...(provider.name === "console" && process.env.NODE_ENV !== "production" ? { devCode: code, devReason: "No email service is configured on this computer." } : {}) };
}

/** Verifies a code. Returns the user id on success. */
export async function verifyChallenge(challengeId: string, code: string): Promise<string> {
  const ch = await db.loginChallenge.findUnique({ where: { id: challengeId } });
  if (!ch) throw new HttpError(400, "That code has expired. Please sign in again.", "challenge_expired");
  if (ch.expiresAt.getTime() < Date.now()) {
    await db.loginChallenge.delete({ where: { id: ch.id } }).catch(() => {});
    throw new HttpError(400, "That code has expired. Please sign in again.", "challenge_expired");
  }
  if (ch.attempts >= MAX_ATTEMPTS) {
    await db.loginChallenge.delete({ where: { id: ch.id } }).catch(() => {});
    throw new HttpError(429, "Too many wrong codes. Please sign in again.", "challenge_expired");
  }
  const ok = hmac(`${ch.userId}:${code.replace(/\D/g, "")}`) === ch.codeHash;
  if (!ok) {
    await db.loginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, `Wrong code. ${MAX_ATTEMPTS - ch.attempts - 1} tries left.`, "wrong_code");
  }
  await db.loginChallenge.delete({ where: { id: ch.id } });
  await db.user.update({ where: { id: ch.userId }, data: { emailVerifiedAt: new Date() } });
  return ch.userId;
}
