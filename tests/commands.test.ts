import { describe, expect, it } from "vitest";
import { validateCommand, validatePackageName } from "@/lib/sandbox/commands";

describe("validateCommand", () => {
  it("allows normal dev commands", () => {
    expect(validateCommand("npm run build")).toBe("npm run build");
    expect(validateCommand("npx tsc --noEmit && ls src")).toBeTruthy();
    expect(validateCommand("cat package.json | head -5")).toBeTruthy();
  });
  it("blocks dangerous or network commands", () => {
    for (const c of ["curl http://x", "wget x", "sudo rm -rf /", "rm -rf /", "python3 -c 'x'", "bash -c ls", "ls $(whoami)", "echo `id`", "kill -9 1", "git push origin main", "ls /Users/raffael", "open http://x", "nohup node x &"]) {
      expect(() => validateCommand(c), c).toThrow();
    }
  });
  it("rejects multi-line and empty commands", () => {
    expect(() => validateCommand("")).toThrow();
    expect(() => validateCommand("ls\nrm -rf .")).toThrow();
  });
});

describe("validatePackageName", () => {
  it("accepts valid names", () => {
    expect(validatePackageName("react")).toBe("react");
    expect(validatePackageName("@tanstack/react-query@^5")).toBeTruthy();
  });
  it("rejects injection attempts", () => {
    expect(() => validatePackageName("react; rm -rf /")).toThrow();
    expect(() => validatePackageName("../evil")).toThrow();
    expect(() => validatePackageName("--registry=http://evil")).toThrow();
  });
});
