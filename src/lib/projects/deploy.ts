import "server-only";
import { db } from "../db";
import { decrypt } from "../crypto";
import { HttpError } from "../http";
import { listFiles, readFile, syncFromDisk } from "./files";
import { projectEnv } from "./env-vars";
import { getTemplate } from "./templates";
import { addDomain, deployProject, domainStatus, removeDomain, slugForVercel, type DeployFile, type Framework } from "../vercel";

const SKIP = /(^|\/)(node_modules|\.git|dist|\.next|\.vite|out)(\/|$)/;

async function tokenFor(userId: string): Promise<string> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { vercelToken: true } });
  if (!u?.vercelToken) throw new HttpError(400, "Hosting isn't connected yet: add a Vercel token in Settings → Hosting.", "vercel_token");
  return decrypt(u.vercelToken);
}

function frameworkFor(template: string): Framework {
  if (template === "react" || template === "website") return "vite";
  if (template === "nextjs") return "nextjs";
  return null;
}

/** Deploys the project to the user's Vercel account and records the live URL. */
export async function deployToVercel(projectId: string, userId: string, onProgress?: (m: string) => void, signal?: AbortSignal) {
  const token = await tokenFor(userId);
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await syncFromDisk(projectId).catch(() => {});
  const entries = await listFiles(projectId);
  const files: DeployFile[] = [];
  for (const e of entries) {
    if (SKIP.test(e.path) || e.path.startsWith(".env")) continue;
    const f = await readFile(projectId, e.path);
    files.push({ file: f.path, data: f.content });
  }
  if (!files.length) throw new HttpError(400, "There's nothing to deploy yet.");
  const name = project.vercelProjectName ?? slugForVercel(project.name, project.id);
  const env = await projectEnv(projectId);
  const template = getTemplate(project.template);
  const result = await deployProject(token, { name, files, framework: frameworkFor(template.id), env, onProgress, signal });
  if (!result.ok) return { ok: false as const, error: result.error, logs: result.logs, name };
  await db.project.update({ where: { id: projectId }, data: { vercelProjectName: name, vercelUrl: result.url, deployedAt: new Date() } });
  return { ok: true as const, url: result.url, name };
}

export async function attachDomain(projectId: string, userId: string, domain: string) {
  const token = await tokenFor(userId);
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.vercelProjectName) throw new HttpError(400, "Deploy the project first, then add a domain.", "not_deployed");
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(clean)) throw new HttpError(400, "That doesn't look like a domain name (example: mysite.com or app.mysite.com).");
  const status = await addDomain(token, project.vercelProjectName, clean);
  await db.project.update({ where: { id: projectId }, data: { customDomain: clean } });
  return status;
}

export async function checkDomain(projectId: string, userId: string) {
  const token = await tokenFor(userId);
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.vercelProjectName || !project.customDomain) throw new HttpError(400, "No custom domain is set for this project.", "no_domain");
  return domainStatus(token, project.vercelProjectName, project.customDomain);
}

export async function detachDomain(projectId: string, userId: string) {
  const token = await tokenFor(userId);
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.vercelProjectName && project.customDomain) await removeDomain(token, project.vercelProjectName, project.customDomain);
  await db.project.update({ where: { id: projectId }, data: { customDomain: null } });
}
