import { describe, expect, it } from "vitest";

// server-only modules can't be imported in vitest directly; stub the marker.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

process.env.ANTHROPIC_API_KEY ??= "sk-test-000000000000";
process.env.DATABASE_URL ??= "postgresql://u:p@127.0.0.1:5433/db";
process.env.SESSION_SECRET ??= "x".repeat(40);
process.env.ENCRYPTION_KEY ??= "ab".repeat(32);

const { resolveInProject, isIgnoredPath } = await import("@/lib/paths");

const PID = "cmttsmkof0006jphi29ceg6wh";

describe("resolveInProject", () => {
  it("accepts normal relative paths", () => {
    expect(resolveInProject(PID, "src/App.tsx").rel).toBe("src/App.tsx");
    expect(resolveInProject(PID, "./src//App.tsx").rel).toBe("src/App.tsx");
  });
  it("rejects traversal", () => {
    expect(() => resolveInProject(PID, "../other")).toThrow(/traversal/);
    expect(() => resolveInProject(PID, "src/../../.env")).toThrow(/traversal/);
    expect(() => resolveInProject(PID, "src/..\\..\\x")).toThrow(/traversal/);
  });
  it("rejects absolute and host paths", () => {
    expect(() => resolveInProject(PID, "/etc/passwd")).toThrow(/Absolute/);
    expect(() => resolveInProject(PID, "C:\\Windows")).toThrow(/Absolute/);
  });
  it("rejects null bytes and other project ids", () => {
    expect(() => resolveInProject(PID, "a\0b")).toThrow();
    expect(() => resolveInProject("../..", "x")).toThrow();
  });
  it("marks generated dirs as ignored", () => {
    expect(isIgnoredPath("node_modules/x/index.js")).toBe(true);
    expect(isIgnoredPath("src/index.ts")).toBe(false);
  });
});
