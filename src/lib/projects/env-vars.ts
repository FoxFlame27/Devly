import "server-only";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { HttpError } from "../http";

export const ENV_KEY = /^[A-Z_][A-Z0-9_]{0,63}$/;
const RESERVED = new Set(["PATH", "HOME", "NODE_OPTIONS", "ANTHROPIC_API_KEY", "DATABASE_URL", "SESSION_SECRET", "ENCRYPTION_KEY"]);

/** Decrypted project environment (never includes platform secrets). */
export async function projectEnv(projectId: string): Promise<Record<string, string>> {
  const rows = await db.projectEnvironment.findMany({ where: { projectId } });
  const out: Record<string, string> = {};
  for (const r of rows) {
    try {
      out[r.key] = decrypt(r.value);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export async function listEnvKeys(projectId: string) {
  const rows = await db.projectEnvironment.findMany({ where: { projectId }, orderBy: { key: "asc" } });
  return rows.map((r) => ({ key: r.key, preview: maskedPreview(r.value), updatedAt: r.updatedAt }));
}

function maskedPreview(cipher: string) {
  try {
    const v = decrypt(cipher);
    return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
  } catch {
    return "••••";
  }
}

export async function setEnvVar(projectId: string, key: string, value: string) {
  if (!ENV_KEY.test(key)) throw new HttpError(400, "Use UPPER_CASE letters, numbers and underscores for the name.");
  if (RESERVED.has(key) || key.startsWith("npm_")) throw new HttpError(400, "That name is reserved.");
  if (value.length > 8000) throw new HttpError(400, "Value is too long.");
  await db.projectEnvironment.upsert({
    where: { projectId_key: { projectId, key } },
    create: { projectId, key, value: encrypt(value) },
    update: { value: encrypt(value) },
  });
}

export async function deleteEnvVar(projectId: string, key: string) {
  await db.projectEnvironment.deleteMany({ where: { projectId, key } });
}
