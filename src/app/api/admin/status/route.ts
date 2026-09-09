import os from "node:os";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { adminRoute } from "@/lib/api/admin-route";
import { getSandbox } from "@/lib/sandbox";
import { allPreviewStates } from "@/lib/projects/preview";
import { activeRunCount } from "@/lib/agent/registry";
import { availableModels, defaultModel } from "@/lib/ai/models";
import { getAIProvider } from "@/lib/ai";
import { getHosting } from "@/lib/hosting";

export const GET = adminRoute(async () => {
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const [users, projects, usages] = dbOk ? await Promise.all([db.user.count(), db.project.count(), db.usage.count()]) : [0, 0, 0];
  return json({
    status: {
      database: dbOk ? "ok" : "error",
      sandbox: { provider: getSandbox().name, description: getSandbox().describe() },
      ai: { provider: getAIProvider(defaultModel()).name, models: availableModels(), defaultModel: defaultModel(), openaiConfigured: !!process.env.OPENAI_API_KEY, claudeConfigured: !!process.env.ANTHROPIC_API_KEY, geminiConfigured: !!process.env.GEMINI_API_KEY },
      hosting: getHosting().name,
      previews: allPreviewStates(),
      activeRuns: activeRunCount(),
      counts: { users, projects, usages },
      system: { node: process.version, platform: `${os.platform()} ${os.arch()}`, uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024), loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100) },
    },
  });
});
