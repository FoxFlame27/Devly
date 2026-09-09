import "server-only";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { getSandbox } from "../sandbox";
import { getHosting } from "../hosting";
import { HttpError } from "../http";
import { projectDir } from "../paths";
import { randomToken } from "../crypto";
import { materialize, syncFromDisk } from "./files";
import { ensureInstalled } from "./preview";
import { getTemplate } from "./templates";
import { projectEnv } from "./env-vars";
import { createSnapshot } from "./snapshots";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
  return `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

export type PublishOutcome = { ok: true; url: string } | { ok: false; error: string; details: string };

export async function publishProject(projectId: string, onProgress?: (msg: string) => void): Promise<PublishOutcome> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Project not found.");
  const template = getTemplate(project.template);
  const hosting = getHosting();
  const slug = project.publishedSlug ?? slugify(project.name);
  await materialize(projectId);
  onProgress?.("Getting things ready...");
  const install = await ensureInstalled(projectId);
  if (!install.ok) return { ok: false, error: "Packages couldn't be installed.", details: install.output.slice(-4000) };
  onProgress?.("Building your project...");
  const env = { ...(await projectEnv(projectId)), BASE_PATH: hosting.basePath(slug).replace(/\/$/, ""), NEXT_PUBLIC_BASE_PATH: hosting.basePath(slug).replace(/\/$/, "") };
  const cmd = template.id === "nextjs" ? template.buildCommand : `${template.buildCommand} --base=${hosting.basePath(slug)}`;
  const res = await getSandbox().exec(projectId, cmd, { timeoutMs: 300_000, env });
  await syncFromDisk(projectId);
  if (res.exitCode !== 0) {
    return { ok: false, error: "The build failed.", details: `${res.stdout}\n${res.stderr}`.slice(-5000) };
  }
  const out = path.join(projectDir(projectId), template.outputDir);
  if (!fs.existsSync(path.join(out, "index.html"))) {
    return { ok: false, error: "The build didn't produce a website.", details: `Expected ${template.outputDir}/index.html to exist after building.` };
  }
  onProgress?.("Publishing...");
  const result = await hosting.publish(projectId, out, slug);
  await db.project.update({ where: { id: projectId }, data: { publishedSlug: slug, publishedAt: new Date() } });
  await createSnapshot(projectId, "Published", "publish");
  return { ok: true, url: result.url };
}
