/**
 * AI model + effort configuration. Models are read from the AI_MODELS env var
 * ("id:Label:Description,id:Label:Description"); nothing in the app hard-codes a model id.
 */
export type ModelOption = { id: string; label: string; description: string };

/** Effort levels accepted by the API. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
/** What the user picks: Auto lets the platform choose. */
export type EffortChoice = "auto" | Effort;

export const EFFORT_OPTIONS: { id: EffortChoice; label: string; description: string }[] = [
  { id: "auto", label: "Auto", description: "Recommended. Picks a sensible amount of thinking for each request." },
  { id: "low", label: "Quick", description: "Fastest. Good for small tweaks like colours and text." },
  { id: "xhigh", label: "Thorough", description: "Thinks harder. Best for new features and tricky bugs." },
  { id: "max", label: "Max", description: "Slowest and most careful. Use when everything else failed." },
];

export const DEFAULT_EFFORT: Effort = "high";

const EFFORTS: readonly string[] = ["low", "medium", "high", "xhigh", "max"];

export function isEffort(v: unknown): v is Effort {
  return typeof v === "string" && EFFORTS.includes(v);
}

export function parseModels(raw: string | undefined): ModelOption[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id = "", label = "", ...rest] = entry.split(":").map((s) => s.trim());
      return { id, label: label || id, description: rest.join(":") };
    })
    .filter((m) => /^[a-z0-9.\-]+$/i.test(m.id));
}

export function pickDefault(models: ModelOption[], preferred?: string): string {
  if (preferred && models.some((m) => m.id === preferred)) return preferred;
  if (models.length === 0) throw new Error("No AI models configured (AI_MODELS).");
  return models[0].id;
}
