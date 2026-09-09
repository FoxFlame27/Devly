import "server-only";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "../db";
import { hmac, randomToken } from "../crypto";
import { HttpError } from "../http";

export const SESSION_COOKIE = "bb_session";
const SESSION_DAYS = 30;

export type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  promptsUsed: number;
  promptLimit: number;
  unlimited: boolean;
  unlimitedUntil: string | null;
};

export function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    promptsUsed: u.promptsUsed,
    promptLimit: u.promptLimit,
    unlimited: isUnlimited(u),
    unlimitedUntil: u.unlimitedUntil ? u.unlimitedUntil.toISOString() : null,
  };
}

export function isUnlimited(u: Pick<User, "unlimited" | "unlimitedUntil">): boolean {
  if (!u.unlimited) return false;
  if (u.unlimitedUntil && u.unlimitedUntil.getTime() < Date.now()) return false;
  return true;
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.session.create({ data: { tokenHash: hmac(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hmac(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Returns the authenticated user from the session cookie, or null. Never trusts client-supplied ids. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hmac(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.disabled) return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in.", "unauthenticated");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Admins only.", "forbidden");
  return user;
}

/** Loads a project and verifies the caller owns it (or is an admin). */
export async function requireProject(projectId: string, user: User) {
  if (!/^[a-z0-9]{10,40}$/i.test(projectId)) throw new HttpError(404, "Project not found.");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || (project.ownerId !== user.id && user.role !== "ADMIN")) throw new HttpError(404, "Project not found.");
  return project;
}
