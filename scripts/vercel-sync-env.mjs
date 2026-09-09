// Copies the settings Devly needs from the local .env to a Vercel project and starts a production deployment.
// Usage: VERCEL_TOKEN=... node scripts/vercel-sync-env.mjs
// Never commits or prints secret values; only names are shown.
import fs from "node:fs";

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID || "prj_x3s5G1xUT18PW8dVI2YlfiUnRqmu";
if (!TOKEN) {
  console.error("Set VERCEL_TOKEN first.");
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  let v = t.slice(i + 1).trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
  env[t.slice(0, i)] = v;
}
const wanted = {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  MESHY_API_KEY: env.MESHY_API_KEY,
  RESEND_API_KEY: env.RESEND_API_KEY,
  EMAIL_FROM: env.EMAIL_FROM || "Devly <onboarding@resend.dev>",
  AI_MODELS: env.AI_MODELS,
  AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL || "gpt-6-astra",
  AI_EFFORT: env.AI_EFFORT || "auto",
  SANDBOX_PROVIDER: "local",
  APP_URL: "https://devlyai.vercel.app",
  EMAIL_VERIFY: "true",
};
const body = Object.entries(wanted)
  .filter(([, v]) => v)
  .map(([key, value]) => ({ key, value, type: "encrypted", target: ["production", "preview"] }));
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
let r = await fetch(`https://api.vercel.com/v10/projects/${PROJECT}/env?upsert=true`, { method: "POST", headers: H, body: JSON.stringify(body) });
let d = await r.json();
if (!r.ok) {
  console.error("Vercel refused:", d.error?.message ?? r.status);
  process.exit(1);
}
console.log("Settings saved in Vercel:", body.map((e) => e.key).join(", "));

// Redeploy so the new settings take effect.
r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${PROJECT}&target=production&limit=1`, { headers: H });
d = await r.json();
const meta = d.deployments?.[0]?.meta ?? {};
if (!meta.githubRepoId) {
  console.log("Could not find the GitHub link; click Redeploy in Vercel.");
  process.exit(0);
}
r = await fetch("https://api.vercel.com/v13/deployments", { method: "POST", headers: H, body: JSON.stringify({ name: "devly", project: PROJECT, target: "production", gitSource: { type: "github", repoId: meta.githubRepoId, ref: "main" } }) });
d = await r.json();
if (!r.ok) {
  console.error("Redeploy failed:", d.error?.message ?? r.status, "- click Redeploy in Vercel instead.");
  process.exit(1);
}
console.log("Deployment started:", d.url ? `https://${d.url}` : d.id, "- live in about a minute.");
