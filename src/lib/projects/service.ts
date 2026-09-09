import "server-only";
import { db } from "../db";
import { HttpError } from "../http";
import { seedFiles } from "./files";
import { getTemplate, inferTemplate, type TemplateId } from "./templates";
import { createSnapshot } from "./snapshots";
import { stopPreview } from "./preview";
import { getHosting } from "../hosting";
import fsp from "node:fs/promises";
import { projectDir, projectHomeDir } from "../paths";

const MAX_PROJECTS_PER_USER = 50;

export function nameFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/^(please\s+)?(build|create|make|design|generate|code|write)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/[^\w\s'-]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5);
  const name = words.join(" ");
  if (!name) return "New Project";
  return name.charAt(0).toUpperCase() + name.slice(1, 60);
}

export async function createProject(userId: string, opts: { prompt?: string; name?: string; template?: TemplateId | null }) {
  const count = await db.project.count({ where: { ownerId: userId } });
  if (count >= MAX_PROJECTS_PER_USER) throw new HttpError(400, `You can have up to ${MAX_PROJECTS_PER_USER} projects. Delete one to make room.`);
  const templateId = opts.template ?? (opts.prompt ? inferTemplate(opts.prompt) : "website");
  const template = getTemplate(templateId);
  const name = (opts.name?.trim() || (opts.prompt ? nameFromPrompt(opts.prompt) : "New Project")).slice(0, 80);
  const project = await db.project.create({
    data: { name, description: opts.prompt?.slice(0, 500) ?? null, template: template.id, ownerId: userId },
  });
  await seedFiles(project.id, template.files);
  await createSnapshot(project.id, "Project created", "create");
  return project;
}

export async function deleteProject(projectId: string) {
  await stopPreview(projectId).catch(() => {});
  const project = await db.project.findUnique({ where: { id: projectId }, select: { publishedSlug: true } });
  if (project?.publishedSlug) await getHosting().unpublish(project.publishedSlug).catch(() => {});
  await db.project.delete({ where: { id: projectId } });
  await fsp.rm(projectDir(projectId), { recursive: true, force: true }).catch(() => {});
  await fsp.rm(projectHomeDir(projectId), { recursive: true, force: true }).catch(() => {});
}
