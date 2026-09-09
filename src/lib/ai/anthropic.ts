import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { AIProviderError, type AIContentBlock, type AIMessage, type AIProvider, type AIStreamParams, type AITurnResult } from "./provider";

const g = globalThis as unknown as { __anthropic?: Anthropic };

function client(): Anthropic {
  // The key only ever lives here, on the server.
  if (!env().ANTHROPIC_API_KEY) throw new AIProviderError("Claude isn't set up: add ANTHROPIC_API_KEY to the platform's .env file, or pick a Gemini model.", false);
  return (g.__anthropic ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 }));
}

function toParam(m: AIMessage): Anthropic.Beta.BetaMessageParam {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = m.content.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> };
    return { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error };
  });
  return { role: m.role, content: blocks };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async streamTurn(p: AIStreamParams): Promise<AITurnResult> {
    const c = client();
    const messages: Anthropic.Beta.BetaMessageParam[] = p.messages.map((m) =>
      isRaw(m) ? { role: "assistant", content: m.content as unknown as Anthropic.Beta.BetaContentBlockParam[] } : toParam(m),
    );
    try {
      const stream = c.beta.messages.stream(
        {
          model: p.model,
          max_tokens: p.maxTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: p.effort },
          system: [
            { type: "text", text: p.system.stable, cache_control: { type: "ephemeral" } },
            { type: "text", text: p.system.dynamic },
          ],
          tools: p.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
          messages,
        },
        { signal: p.signal },
      );
      stream.on("text", (delta) => p.onText(delta));
      const final = await stream.finalMessage();
      const content: AIContentBlock[] = [];
      for (const b of final.content) {
        if (b.type === "text") content.push({ type: "text", text: b.text });
        else if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      }
      const stopReason: AITurnResult["stopReason"] =
        final.stop_reason === "end_turn" || final.stop_reason === "tool_use" || final.stop_reason === "max_tokens" || final.stop_reason === "refusal"
          ? final.stop_reason
          : "other";
      return {
        content,
        stopReason,
        usage: { inputTokens: (final.usage.input_tokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0), outputTokens: final.usage.output_tokens ?? 0 },
        raw: final.content,
      };
    } catch (e) {
      if (p.signal.aborted) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new AIProviderError("The AI service rejected the platform's API key.", false, e.status);
      if (e instanceof Anthropic.RateLimitError) throw new AIProviderError("The AI service is busy right now. Please try again in a moment.", true, e.status);
      if (e instanceof Anthropic.BadRequestError) {
        if (/credit balance|billing/i.test(e.message)) throw new AIProviderError("The platform's AI account has no credits left. The site owner needs to add credits before the AI can work.", false, e.status);
        throw new AIProviderError("The AI request was rejected. Try rephrasing or starting a new conversation.", false, e.status);
      }
      if (e instanceof Anthropic.APIConnectionError) throw new AIProviderError("Couldn't reach the AI service. Check your connection and try again.", true);
      if (e instanceof Anthropic.APIError) throw new AIProviderError("The AI service had a problem. Please try again.", (e.status ?? 500) >= 500, e.status);
      throw e;
    }
  }
}

/** Assistant turns are replayed with the provider's raw blocks so thinking blocks stay intact. */
export function rawAssistantMessage(raw: unknown): AIMessage {
  return { role: "assistant", content: raw as unknown as AIContentBlock[], raw: true } as AIMessage;
}

/** Raw provider blocks (from rawAssistantMessage) are passed through untouched. */
function isRaw(m: AIMessage): boolean {
  return m.role === "assistant" && Array.isArray(m.content) && (m as unknown as { raw?: boolean }).raw === true;
}
