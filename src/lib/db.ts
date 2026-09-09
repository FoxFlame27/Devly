import "server-only";
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

/** Hosting integrations (Supabase, Vercel Postgres, Neon) name the connection string differently; accept them. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL_UNPOOLED;
}

export const db: PrismaClient =
  g.__prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") g.__prisma = db;
