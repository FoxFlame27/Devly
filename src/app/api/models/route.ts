import { handler, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { availableModels, defaultEffort, defaultModel } from "@/lib/ai/models";
import { EFFORT_OPTIONS } from "@/config/models";

export const GET = handler(async () => {
  await requireUser();
  return json({ models: availableModels(), defaultModel: defaultModel(), efforts: EFFORT_OPTIONS, defaultEffort: "auto" });
});
