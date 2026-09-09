import "server-only";
import { randomUUID } from "node:crypto";
import { AIProviderError, type AIContentBlock, type AIMessage, type AIProvider, type AIStreamParams, type AITurnResult } from "./provider";

/**
 * Google Gemini provider (REST, no SDK). Free tier available at aistudio.google.com.
 * Maps the platform's provider-agnostic messages/tools onto Gemini's contents/functionDeclarations.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> }; thought?: boolean };
type Content = { role: "user" | "model"; parts: Part[] };

function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === "additionalProperties" || k === "$schema" || k === "default") continue;
      out[k] = cleanSchema(v);
    }
    return out;
  }
  return schema;
}

function thinkingBudget(effort: AIStreamParams["effort"], model: string): number | undefined {
  // -1 lets Gemini decide; larger budgets for higher effort. Flash-Lite ignores thinking.
  if (/lite/.test(model)) return undefined;
  switch (effort) {
    case "low":
      return /pro/.test(model) ? 128 : 0;
    case "medium":
      return -1;
    case "high":
      return -1;
    case "xhigh":
      return 8192;
    case "max":
      return 24576;
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  private key(): string {
    const k = process.env.GEMINI_API_KEY;
    if (!k) throw new AIProviderError("Gemini isn't set up yet: add GEMINI_API_KEY to the platform's .env file.", false);
    return k;
  }

  private toContents(messages: AIMessage[]): Content[] {
    const toolNames = new Map<string, string>();
    const out: Content[] = [];
    for (const m of messages) {
      if (typeof m.content === "string") {
        out.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] });
        continue;
      }
      const parts: Part[] = [];
      for (const b of m.content as AIContentBlock[]) {
        if (b.type === "text") {
          if (b.text) parts.push({ text: b.text });
        } else if (b.type === "tool_use") {
          toolNames.set(b.id, b.name);
          parts.push({ functionCall: { name: b.name, args: (b.input ?? {}) as Record<string, unknown> } });
        } else if (b.type === "tool_result") {
          parts.push({ functionResponse: { name: toolNames.get(b.tool_use_id) ?? "tool", response: { result: b.content, ...(b.is_error ? { error: true } : {}) } } });
        }
      }
      if (parts.length) out.push({ role: m.role === "user" ? "user" : "model", parts });
    }
    return out;
  }

  async streamTurn(p: AIStreamParams): Promise<AITurnResult> {
    const key = this.key();
    const budget = thinkingBudget(p.effort, p.model);
    const body = {
      systemInstruction: { parts: [{ text: `${p.system.stable}\n\n${p.system.dynamic}` }] },
      contents: this.toContents(p.messages),
      tools: p.tools.length
        ? [
            {
              functionDeclarations: p.tools.map((t) => {
                const schema = cleanSchema(t.input_schema) as { properties?: Record<string, unknown> };
                const hasProps = schema.properties && Object.keys(schema.properties).length > 0;
                return { name: t.name, description: t.description, ...(hasProps ? { parameters: schema } : {}) };
              }),
            },
          ]
        : undefined,
      generationConfig: {
        maxOutputTokens: Math.min(p.maxTokens, 65536),
        temperature: 0.4,
        ...(budget !== undefined ? { thinkingConfig: { thinkingBudget: budget } } : {}),
      },
    };

    let res: Response;
    try {
      res = await fetch(`${BASE}/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: p.signal,
      });
    } catch (e) {
      if (p.signal.aborted) throw e;
      throw new AIProviderError("Couldn't reach Gemini. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = "";
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        msg = text.slice(0, 200);
      }
      if (res.status === 429) throw new AIProviderError("Gemini's free limit was reached for now. Wait a minute and try again.", true, 429);
      if (res.status === 401 || res.status === 403) throw new AIProviderError("Gemini rejected the platform's API key. Check GEMINI_API_KEY.", false, res.status);
      if (res.status === 404) throw new AIProviderError(`Gemini doesn't know the model "${p.model}". Check AI_MODELS.`, false, 404);
      if (res.status >= 500) throw new AIProviderError("Gemini had a problem. Please try again.", true, res.status);
      throw new AIProviderError(`Gemini rejected the request${msg ? `: ${msg}` : "."}`, false, res.status);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const content: AIContentBlock[] = [];
    let text = "";
    let finish = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    const pushText = (t: string) => {
      if (!t) return;
      text += t;
      p.onText(t);
    };
    const handle = (json: string) => {
      let ev: { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
      try {
        ev = JSON.parse(json);
      } catch {
        return;
      }
      const c = ev.candidates?.[0];
      for (const part of c?.content?.parts ?? []) {
        if (part.thought) continue;
        if (part.text) pushText(part.text);
        if (part.functionCall) {
          if (text) {
            content.push({ type: "text", text });
            text = "";
          }
          content.push({ type: "tool_use", id: `call_${randomUUID().slice(0, 12)}`, name: part.functionCall.name, input: part.functionCall.args ?? {} });
        }
      }
      if (c?.finishReason) finish = c.finishReason;
      if (ev.usageMetadata) usage = { inputTokens: ev.usageMetadata.promptTokenCount ?? 0, outputTokens: (ev.usageMetadata.candidatesTokenCount ?? 0) + (ev.usageMetadata.thoughtsTokenCount ?? 0) };
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split("\n")) if (line.startsWith("data: ")) handle(line.slice(6));
      }
    }
    if (text) content.push({ type: "text", text });
    const hasTools = content.some((b) => b.type === "tool_use");
    const stopReason: AITurnResult["stopReason"] = hasTools ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : finish === "SAFETY" || finish === "PROHIBITED_CONTENT" ? "refusal" : "end_turn";
    return { content, stopReason, usage, raw: content };
  }
}
