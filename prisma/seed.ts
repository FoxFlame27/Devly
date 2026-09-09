/* Seeds an admin user and the initial access code. Safe to run repeatedly. */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes, scryptSync } from "node:crypto";

const db = new PrismaClient();

function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({ data: { email, passwordHash: hashPassword(password), role: "ADMIN", unlimited: true, name: "Admin" } });
    console.log(`Created admin ${email}`);
  } else if (existing.role !== "ADMIN") {
    await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
    console.log(`Promoted ${email} to admin`);
  }
  const code = (process.env.SEED_ACCESS_CODE ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (code) {
    const codeHash = createHmac("sha256", secret).update(code).digest("hex");
    const found = await db.accessCode.findUnique({ where: { codeHash } });
    if (!found) {
      await db.accessCode.create({ data: { codeHash, hint: code.slice(-2), type: "UNLIMITED", label: "Seed code (unlimited)", maxRedemptions: null } });
      console.log(`Created unlimited access code ending in ${code.slice(-2)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
