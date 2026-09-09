import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { adminRoute } from "@/lib/api/admin-route";

export const GET = adminRoute(async () => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [totals, byModel, recent] = await Promise.all([
    db.usage.aggregate({ _sum: { inputTokens: true, outputTokens: true }, _count: true, where: { createdAt: { gte: since } } }),
    db.usage.groupBy({ by: ["model"], _sum: { inputTokens: true, outputTokens: true }, _count: true, where: { createdAt: { gte: since } } }),
    db.usage.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, model: true, inputTokens: true, outputTokens: true, steps: true, durationMs: true, status: true, createdAt: true, user: { select: { email: true } }, project: { select: { name: true } } } }),
  ]);
  return json({ totals, byModel, recent });
});
