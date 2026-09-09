import "server-only";
import { randomUUID } from "node:crypto";
import type { AIContentBlock, AIMessage, AIProvider, AIStreamParams, AITurnResult } from "./provider";

/**
 * Deterministic scripted provider for automated tests (AI_PROVIDER=mock).
 * It walks the same tool loop a real model would: inspect, read, edit, check, summarise.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async streamTurn(p: AIStreamParams): Promise<AITurnResult> {
    const toolResults = p.messages.filter((m) => m.role === "user" && Array.isArray(m.content)).length;
    void p.effort;
    const lastUser = [...p.messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
    const request = typeof lastUser?.content === "string" ? lastUser.content : "";
    const say = (text: string) => {
      p.onText(text);
      return { type: "text", text } as AIContentBlock;
    };
    const tool = (name: string, input: unknown) => ({ type: "tool_use", id: `toolu_${randomUUID().slice(0, 8)}`, name, input }) as AIContentBlock;
    let content: AIContentBlock[];
    let stop: AITurnResult["stopReason"] = "tool_use";
    switch (toolResults) {
      case 0:
        content = [tool("get_project_structure", {})];
        break;
      case 1:
        content = [tool("read_file", { path: "src/App.tsx" }), tool("read_file", { path: "index.html" })];
        break;
      case 2: {
        const title = request.match(/called ([A-Za-z0-9 ]+?)(?:\s+with|[.,]|$)/)?.[1]?.trim() || "My Site";
        content = [
          tool("write_file", {
            path: "src/App.tsx",
            content: `export default function App() {\n  return (\n    <main className="min-h-screen grid place-content-center text-center p-8">\n      <h1 className="text-4xl font-bold">${title}</h1>\n      <p className="mt-2 text-neutral-400">Built by the mock agent.</p>\n    </main>\n  );\n}\n`,
          }),
          tool("edit_file", { path: "index.html", old_text: "<title>My App</title>", new_text: `<title>${title}</title>` }),
        ];
        break;
      }
      case 3:
        content = [tool("get_project_errors", {}), tool("start_preview", {})];
        break;
      default:
        content = [say("Done! I set up the page with the new title and checked that everything runs.")];
        stop = "end_turn";
    }
    return { content, stopReason: stop, usage: { inputTokens: 100, outputTokens: 50 }, raw: content };
  }
}

export type { AIMessage };
