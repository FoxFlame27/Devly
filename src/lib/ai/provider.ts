import type { FileChanges } from "../projects/files";

/**
 * Provider-agnostic AI interface. The agent runner only talks to this,
 * so Anthropic can be swapped for another provider by adding a new implementation.
 */
export type AIToolDefinition = { name: string; description: string; input_schema: { type: "object"; [k: string]: unknown } };

export type AIContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type AIMessage = { role: "user" | "assistant"; content: string | AIContentBlock[] };

export type AITurnResult = {
  content: AIContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";
  usage: { inputTokens: number; outputTokens: number };
  /** Raw provider content for replay in the next turn (keeps thinking blocks etc.) */
  raw: unknown;
};

export type AIStreamParams = {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  system: { stable: string; dynamic: string };
  messages: AIMessage[];
  tools: AIToolDefinition[];
  maxTokens: number;
  signal: AbortSignal;
  onText: (delta: string) => void;
};

export class AIProviderError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

export interface AIProvider {
  readonly name: string;
  streamTurn(params: AIStreamParams): Promise<AITurnResult>;
}

export type { FileChanges };
