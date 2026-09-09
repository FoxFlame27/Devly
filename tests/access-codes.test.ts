import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
process.env.ANTHROPIC_API_KEY ??= "sk-test-000000000000";
process.env.DATABASE_URL ??= "postgresql://u:p@127.0.0.1:5433/db";
process.env.SESSION_SECRET ??= "x".repeat(40);
process.env.ENCRYPTION_KEY ??= "ab".repeat(32);

const { normalizeCode, generateCode } = await import("@/lib/access-codes");
const { encrypt, decrypt, hashPassword, verifyPassword } = await import("@/lib/crypto");

describe("access codes", () => {
  it("normalises codes", () => {
    expect(normalizeCode(" 27-05 13 ")).toBe("270513");
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
  });
  it("generates unique, well-formed codes", () => {
    const a = generateCode();
    const b = generateCode();
    expect(a).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(a).not.toBe(b);
  });
});

describe("crypto", () => {
  it("round-trips encryption", () => {
    const c = encrypt("hello secret");
    expect(c).not.toContain("hello");
    expect(decrypt(c)).toBe("hello secret");
  });
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("password123");
    expect(await verifyPassword("password123", h)).toBe(true);
    expect(await verifyPassword("password124", h)).toBe(false);
  });
});
