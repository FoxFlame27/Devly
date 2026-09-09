import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { isUnlimited } from "./auth/session";

export function promptsRemaining(u: User): number | null {
  if (isUnlimited(u)) return null;
  return Math.max(0, u.promptLimit - u.promptsUsed);
}

/**
 * Atomically reserves one prompt for the user. Throws if none are left.
 * Enforced in the database so refreshes, parallel tabs, or replayed requests cannot bypass it.
 */
export async function consumePrompt(user: User): Promise<void> {
  if (isUnlimited(user)) return;
  const res = await db.user.updateMany({
    where: { id: user.id, promptsUsed: { lt: user.promptLimit } },
    data: { promptsUsed: { increment: 1 } },
  });
  if (res.count === 0) {
    throw new HttpError(402, "You've used your free prompts.", "prompt_limit");
  }
}

/** Gives a prompt back when the AI provider failed before doing any work. */
export async function refundPrompt(user: User): Promise<void> {
  if (isUnlimited(user)) return;
  await db.user.updateMany({ where: { id: user.id, promptsUsed: { gt: 0 } }, data: { promptsUsed: { decrement: 1 } } });
}
