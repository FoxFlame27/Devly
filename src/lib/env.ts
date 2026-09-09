import "server-only";
import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MESHY_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_VERIFY: z.string().optional(),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/, "must start with postgresql://"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AI_MODELS: z.string().default("claude-opus-5:Claude Opus 5:Most capable. Best for building whole features.,claude-sonnet-5:Claude Sonnet 5:Faster. Great for quick changes."),
  AI_DEFAULT_MODEL: z.string().optional(),
  AI_EFFORT: z.string().optional(),
  SANDBOX_PROVIDER: z.preprocess((v) => (v === "auto" || v === "local" || v === "docker" ? v : "auto"), z.enum(["auto", "local", "docker"])),
  DATA_DIR: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated platform environment. Only ever imported from server code. */
export function env() {
  if (cached) return cached;
  const raw: NodeJS.ProcessEnv = { ...process.env };
  // Fallbacks for common hosting setups so fewer settings have to be typed by hand.
  raw.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!raw.APP_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) raw.APP_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid platform configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
