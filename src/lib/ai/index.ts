import "server-only";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";

export type ProviderName = "openai" | "gemini" | "anthropic";

/** Which provider serves a model id. Add new providers here. */
export function providerFor(model: string): ProviderName {
  if (/^(gpt|o[1-9]|chatgpt)/i.test(model)) return "openai";
  if (/^gemini/i.test(model)) return "gemini";
  return "anthropic";
}

export function providerConfigured(name: ProviderName): boolean {
  if (name === "openai") return !!process.env.OPENAI_API_KEY;
  if (name === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

/** AI_PROVIDER=mock forces the scripted test provider. */
export function getAIProvider(model?: string): AIProvider {
  if (process.env.AI_PROVIDER === "mock") return new MockProvider();
  const name = model ? providerFor(model) : "openai";
  if (name === "openai") return new OpenAIProvider();
  if (name === "gemini") return new GeminiProvider();
  return new AnthropicProvider();
}

export * from "./provider";
export { rawAssistantMessage } from "./anthropic";
