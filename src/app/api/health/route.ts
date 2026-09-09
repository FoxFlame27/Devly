import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Deployment health check. Reports which required settings are missing or malformed and whether the
 * database answers. Only variable names and true/false are returned, never values.
 */
export const dynamic = "force-dynamic";

const rules: Record<string, z.ZodTypeAny> = {
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i),
  APP_URL: z.string().url(),
};

export async function GET() {
  const problems: string[] = [];
  const effective: Record<string, string | undefined> = {
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    APP_URL: process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
  };
  for (const [name, schema] of Object.entries(rules)) {
    const v = effective[name];
    if (v === undefined || v === "") problems.push(`${name} is ${process.env[name] !== undefined ? "set but empty" : "missing"}`);
    else if (!schema.safeParse(v).success) problems.push(`${name} is set but not valid (${hint(name)})`);
  }
  let database: string = "not checked";
  if (!problems.some((p) => p.startsWith("DATABASE_URL"))) {
    try {
      const { db } = await import("@/lib/db");
      const users = await db.user.count();
      database = `ok (${users} users)`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string })?.code;
      const first = msg.split("\n").map((l) => l.trim()).filter((l) => l && !/^Invalid `|^prisma\./.test(l))[0] ?? msg.slice(0, 160);
      if (/does not exist|relation/i.test(msg)) database = "connected, but tables are missing: run `npx prisma db push` against this database";
      else if (/Can't reach database server|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) database = `cannot reach the database server (${code ?? "network"}): check the host/port; on Vercel use Supabase's Transaction pooler URL (port 6543)`;
      else if (/password authentication failed|Authentication failed/i.test(msg)) database = "wrong database password in DATABASE_URL";
      else database = `cannot connect${code ? ` (${code})` : ""}: ${first.slice(0, 200)}`;
    }
  }
  const providers = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    meshy: !!process.env.MESHY_API_KEY,
    resend: !!process.env.RESEND_API_KEY,
    supabaseOtp: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
  let storage = "not checked";
  try {
    const { dataDir } = await import("@/lib/paths");
    const fs = await import("node:fs");
    const dir = dataDir();
    fs.writeFileSync(`${dir}/.write-test`, "ok");
    fs.rmSync(`${dir}/.write-test`, { force: true });
    storage = `writable (${dir})`;
  } catch (e) {
    storage = `NOT writable: ${e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : String(e)}`;
  }
  const detected = Object.keys(process.env).filter((k) => /^(POSTGRES_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_|VERCEL_(ENV|URL|PROJECT_PRODUCTION_URL)$)/.test(k)).sort();
  const ok = problems.length === 0 && database.startsWith("ok");
  return NextResponse.json({ ok, problems, database, storage, providers, detectedVariables: detected, node: process.version }, { status: ok ? 200 : 503 });
}

function hint(name: string): string {
  switch (name) {
    case "SESSION_SECRET":
      return "must be at least 32 characters";
    case "ENCRYPTION_KEY":
      return "must be exactly 64 hex characters, e.g. from `openssl rand -hex 32`";
    case "DATABASE_URL":
    case "APP_URL":
      return name === "DATABASE_URL" ? "must start with postgresql:// (no quotes, no [YOUR-PASSWORD] placeholder)" : "must be a full URL";
    default:
      return "check the value";
  }
}
