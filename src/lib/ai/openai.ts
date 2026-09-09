import "server-only";
import { AIProviderError, type AIContentBlock, type AIMessage, type AIProvider, type AIStreamParams, type AITurnResult } from "./provider";

/**
 * OpenAI provider using the Responses API (streaming, function tools, reasoning effort).
 * Stateless: reasoning items are replayed with their encrypted content, nothing is stored server-side.
 */
const BASE = process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ?? "https://api.openai.com/v1";

type Item = Record<string, unknown> & { type?: string; role?: string };

function effortFor(effort: AIStreamParams["effort"]): string {
  return { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "xhigh" }[effort];
}

function toInput(messages: AIMessage[]): Item[] {
  const out: Item[] = [];
  for (const m of messages) {
    if ((m as { raw?: boolean }).raw && Array.isArray(m.content)) {
      out.push(...(m.content as unknown as Item[]));
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content as AIContentBlock[];
    if (m.role === "user" && blocks.some((b) => b.type === "image")) {
      const parts: unknown[] = [];
      for (const b of blocks) {
        if (b.type === "text") parts.push({ type: "input_text", text: b.text });
        else if (b.type === "image") parts.push({ type: "input_image", image_url: `data:${b.mediaType};base64,${b.data}`, detail: "auto" });
      }
      out.push({ role: "user", content: parts } as unknown as Item);
      continue;
    }
    for (const b of blocks) {
      if (b.type === "text") out.push({ role: m.role, content: b.text });
      else if (b.type === "tool_use") out.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
      else if (b.type === "tool_result") out.push({ type: "function_call_output", call_id: b.tool_use_id, output: b.content });
    }
  }
  return out;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  private key(): string {
    const k = process.env.OPENAI_API_KEY;
    if (!k) throw new AIProviderError("OpenAI isn't set up yet: add OPENAI_API_KEY to the platform's .env file.", false);
    return k;
  }

  async streamTurn(p: AIStreamParams): Promise<AITurnResult> {
    const key = this.key();
    const body = {
      model: p.model,
      instructions: `${p.system.stable}\n\n${p.system.dynamic}`,
      input: toInput(p.messages),
      tools: p.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.input_schema, strict: false })),
      reasoning: { effort: effortFor(p.effort) },
      max_output_tokens: p.maxTokens,
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
      parallel_tool_calls: true,
    };
    let res: Response;
    try {
      res = await fetch(`${BASE}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: p.signal,
      });
    } catch (e) {
      if (p.signal.aborted) throw e;
      throw new AIProviderError("Couldn't reach OpenAI. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = "";
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        msg = text.slice(0, 200);
      }
      if (res.status === 429) throw new AIProviderError(/quota|billing/i.test(msg) ? "The platform's OpenAI account is out of quota. The site owner needs to top it up." : "OpenAI is busy right now. Please try again in a moment.", true, 429);
      if (res.status === 401) throw new AIProviderError("OpenAI rejected the platform's API key. Check OPENAI_API_KEY.", false, 401);
      if (res.status === 404) throw new AIProviderError(`OpenAI doesn't know the model "${p.model}". Check AI_MODELS.`, false, 404);
      if (res.status >= 500) throw new AIProviderError("OpenAI had a problem. Please try again.", true, res.status);
      throw new AIProviderError(`OpenAI rejected the request${msg ? `: ${msg}` : "."}`, false, res.status);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    type FinalResponse = { output?: Item[]; usage?: { input_tokens?: number; output_tokens?: number }; status?: string; incomplete_details?: { reason?: string } };
    const state: { final: FinalResponse | null; failure: string | null } = { final: null, failure: null };
    const handle = (json: string) => {
      let ev: { type: string; delta?: string; response?: FinalResponse; error?: { message?: string } };
      try {
        ev = JSON.parse(json);
      } catch {
        return;
      }
      if (ev.type === "response.output_text.delta" && ev.delta) p.onText(ev.delta);
      else if (ev.type === "response.completed" || ev.type === "response.incomplete") state.final = ev.response ?? null;
      else if (ev.type === "response.failed") state.failure = (ev.response as { error?: { message?: string } } | undefined)?.error?.message ?? "The AI request failed.";
      else if (ev.type === "error") state.failure = ev.error?.message ?? "The AI request failed.";
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
    if (state.failure) throw new AIProviderError(`OpenAI: ${state.failure}`, true);
    if (!state.final) throw new AIProviderError("OpenAI ended the response unexpectedly. Please try again.", true);
    const done: FinalResponse = state.final;
    const output = done.output ?? [];
    const content: AIContentBlock[] = [];
    for (const item of output) {
      if (item.type === "message") {
        const parts = (item.content as { type: string; text?: string; refusal?: string }[] | undefined) ?? [];
        const text = parts.map((c) => (c.type === "output_text" ? c.text ?? "" : c.type === "refusal" ? c.refusal ?? "" : "")).join("");
        if (text) content.push({ type: "text", text });
      } else if (item.type === "function_call") {
        let input: unknown = {};
        try {
          input = JSON.parse(String(item.arguments ?? "{}"));
        } catch {
          input = {};
        }
        content.push({ type: "tool_use", id: String(item.call_id), name: String(item.name), input });
      }
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    const refused = output.some((i: Item) => i.type === "message" && ((i.content as { type: string }[] | undefined) ?? []).some((c) => c.type === "refusal"));
    const stopReason: AITurnResult["stopReason"] = hasTools ? "tool_use" : done.status === "incomplete" && done.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : refused ? "refusal" : "end_turn";
    return {
      content,
      stopReason,
      usage: { inputTokens: done.usage?.input_tokens ?? 0, outputTokens: done.usage?.output_tokens ?? 0 },
      raw: output,
    };
  }
}
