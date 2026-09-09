import { z } from "zod";
import { enforceRateLimit, json, parseBody } from "@/lib/http";
import { authedRoute } from "@/lib/api/project-route";
import { getAIProvider, AIProviderError } from "@/lib/ai";
import { availableModels } from "@/lib/ai/models";
import { HttpError } from "@/lib/http";

const SYSTEM = `You rewrite short requests into clear, specific briefs for an AI website/app builder. Keep the user's intent and language. Add concrete details a builder needs: purpose, key sections or features, style/mood, colours if implied, and any content to include. Keep it to one paragraph of at most 90 words, written as a request ("Build ..."). Return only the improved request, nothing else.`;

/** Turns a rough idea into a better prompt for the builder. */
export const POST = authedRoute(async (req, { user }) => {
  enforceRateLimit(req, "improve", 30, 10 * 60 * 1000, user.id);
  const body = await parseBody(req, z.object({ text: z.string().trim().min(2).max(4000) }));
  const models = availableModels();
  const model = (models.find((m) => /mini|flash|haiku/.test(m.id)) ?? models[0])?.id;
  if (!model) throw new HttpError(500, "No AI model is configured.");
  let out = "";
  try {
    const turn = await getAIProvider(model).streamTurn({
      model,
      effort: "low",
      system: { stable: SYSTEM, dynamic: "" },
      messages: [{ role: "user", content: body.text }],
      tools: [],
      maxTokens: 600,
      signal: req.signal,
      onText: (d) => {
        out += d;
      },
    });
    const text = (turn.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text ?? out;
    return json({ text: text.trim().replace(/^["“]|["”]$/g, "") });
  } catch (e) {
    throw new HttpError(502, e instanceof AIProviderError ? e.message : "Couldn't improve the prompt right now.");
  }
});
