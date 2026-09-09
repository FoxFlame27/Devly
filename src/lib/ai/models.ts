import "server-only";
import { env } from "../env";
import { DEFAULT_EFFORT, isEffort, parseModels, pickDefault, type Effort, type ModelOption } from "@/config/models";
import { providerConfigured, providerFor } from "./index";

/** Configured models whose provider has an API key set. */
export function availableModels(): ModelOption[] {
  return parseModels(env().AI_MODELS).filter((m) => process.env.AI_PROVIDER === "mock" || providerConfigured(providerFor(m.id)));
}

export function defaultModel(): string {
  return pickDefault(availableModels(), env().AI_DEFAULT_MODEL);
}

export function defaultEffort(): Effort {
  const e = env().AI_EFFORT;
  return isEffort(e) ? e : DEFAULT_EFFORT;
}

/** "auto" (or anything unknown) resolves to the platform default. */
export function resolveEffort(requested?: string | null): Effort {
  return isEffort(requested) ? requested : defaultEffort();
}

export function resolveModel(requested?: string | null): string {
  const models = availableModels();
  if (requested && models.some((m) => m.id === requested)) return requested;
  return defaultModel();
}
