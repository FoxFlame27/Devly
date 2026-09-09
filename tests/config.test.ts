import { describe, expect, it } from "vitest";
import { parseModels, pickDefault } from "@/config/models";
import { inferTemplate, TEMPLATES } from "@/lib/projects/templates";

describe("model config", () => {
  it("parses id:label pairs", () => {
    expect(parseModels("claude-opus-5:Claude Opus 5:Most capable, claude-sonnet-5:Sonnet")).toEqual([
      { id: "claude-opus-5", label: "Claude Opus 5", description: "Most capable" },
      { id: "claude-sonnet-5", label: "Sonnet", description: "" },
    ]);
  });
  it("drops invalid ids and picks a default", () => {
    const models = parseModels("bad id!:x,claude-opus-5:Opus");
    expect(models).toHaveLength(1);
    expect(pickDefault(models, "missing")).toBe("claude-opus-5");
    expect(() => pickDefault([], undefined)).toThrow();
  });
});

describe("templates", () => {
  it("every template has runnable package.json and an entry html", () => {
    for (const t of Object.values(TEMPLATES)) {
      expect(JSON.parse(t.files["package.json"]).scripts.dev).toBeTruthy();
      expect(t.devCommand).toContain("$PORT");
    }
  });
  it("infers a template from the idea", () => {
    expect(inferTemplate("a portfolio website for my photography")).toBe("website");
    expect(inferTemplate("a todo app with drag and drop")).toBe("react");
    expect(inferTemplate("a Next.js blog")).toBe("nextjs");
  });
});
