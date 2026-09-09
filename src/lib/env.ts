import "server-only";
import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AI_MODELS: z.string().default("claude-opus-5:Claude Opus 5:Most capable. Best for building whole features.,claude-sonnet-5:Claude Sonnet 5:Faster. Great for quick changes."),
  AI_DEFAULT_MODEL: z.string().optional(),
  AI_EFFORT: z.string().optional(),
  SANDBOX_PROVIDER: z.enum(["auto", "local", "docker"]).default("auto"),
  DATA_DIR: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated platform environment. Only ever imported from server code. */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid platform configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
