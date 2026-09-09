import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Deployment health check. Reports which required settings are missing or malformed and whether the
 * database answers. Only variable names and true/false are returned, never values.
 */
export const dynamic = "force-dynamic";

const rules: Record<string, z.ZodTypeAny> = {
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i),
  APP_URL: z.string().url(),
  AI_MODELS: z.string().min(1),
};

export async function GET() {
  const problems: string[] = [];
  for (const [name, schema] of Object.entries(rules)) {
    const v = process.env[name];
    if (v === undefined || v === "") problems.push(`${name} is missing`);
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
      database = /does not exist|relation/i.test(msg) ? "connected, but tables are missing: run `npx prisma db push` against this database" : `cannot connect: ${msg.split("\n")[0].slice(0, 160)}`;
    }
  }
  const providers = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    meshy: !!process.env.MESHY_API_KEY,
    resend: !!process.env.RESEND_API_KEY,
    supabaseOtp: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  const ok = problems.length === 0 && database.startsWith("ok");
  return NextResponse.json({ ok, problems, database, providers, node: process.version }, { status: ok ? 200 : 503 });
}

function hint(name: string): string {
  switch (name) {
    case "SESSION_SECRET":
      return "must be at least 32 characters";
    case "ENCRYPTION_KEY":
      return "must be exactly 64 hex characters, e.g. from `openssl rand -hex 32`";
    case "DATABASE_URL":
    case "APP_URL":
      return "must be a full URL";
    default:
      return "check the value";
  }
}
