import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "./env";
import { rateLimit } from "./ratelimit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg, code: "validation" }, { status: 400 });
  }
  console.error("[api]", err);
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}

/** Wraps a route handler with uniform error handling. */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const MAX_BODY = 2 * 1024 * 1024; // 2 MB

export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T, maxBytes = MAX_BODY): Promise<z.infer<T>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request is too large.");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
  return schema.parse(data);
}

/** CSRF protection: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) {
    // Non-browser clients omit Origin; require the custom header instead.
    if (req.headers.get("x-requested-with") === "fetch") return;
    throw new HttpError(403, "Missing origin.");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Bad origin.");
  }
  const appHost = new URL(env().APP_URL).host;
  if (originHost !== host && originHost !== appHost) throw new HttpError(403, "Cross-site request blocked.");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function enforceRateLimit(req: Request, scope: string, limit: number, windowMs: number, userKey?: string) {
  const key = `${scope}:${userKey ?? clientIp(req)}`;
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) throw new HttpError(429, "Too many requests. Please wait a moment and try again.", "rate_limited");
}
