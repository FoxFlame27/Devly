import "server-only";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { buildTree, listFiles, type TreeNode } from "../projects/files";
import { collectPreviewErrors } from "../projects/preview";
import { projectDir } from "../paths";
import { getTemplate } from "../projects/templates";

function treeLines(nodes: TreeNode[], depth = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    if (out.length > 150) {
      out.push("  ...");
      break;
    }
    out.push(`${"  ".repeat(depth)}${n.name}${n.type === "dir" ? "/" : ""}`);
    if (n.children) treeLines(n.children, depth + 1, out);
  }
  return out;
}

/**
 * Per-request project context. Kept compact: structure, framework, recent changes and current errors.
 * The agent reads individual files through tools when it needs them.
 */
export async function buildProjectContext(projectId: string, conversationId: string): Promise<string> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, template: true, description: true } });
  const template = getTemplate(project?.template);
  const files = await listFiles(projectId);
  const parts: string[] = [];
  parts.push(`Project: "${project?.name ?? "Untitled"}"`);
  if (template.id === "static") {
    parts.push("Project type: plain HTML/CSS/JS site with NO build step and no npm. index.html is the entry; link files with relative paths (styles.css, app.js). Load any library from a CDN <script>/<link> tag (e.g. Tailwind play CDN, React UMD, three.js). Do not create package.json, do not run commands. The preview shows index.html directly and refreshes when files change.");
  } else {
    parts.push(`Template: ${template.label} (${template.id}). Dev command: ${template.devCommand}. Build output: ${template.outputDir}/.`);
  }
  if (project?.description) parts.push(`Original idea: ${project.description}`);
  parts.push(`Files:\n${treeLines(buildTree(files)).join("\n")}`);
  try {
    const pkg = fs.readFileSync(path.join(projectDir(projectId), "package.json"), "utf8");
    parts.push(`package.json:\n${pkg.slice(0, 3000)}`);
  } catch {
    /* none */
  }
  const recent = await db.message.findMany({
    where: { conversationId, role: "ASSISTANT", changes: { not: undefined } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { changes: true },
  });
  const changed = new Set<string>();
  for (const m of recent) {
    const c = m.changes as { created?: string[]; changed?: string[] } | null;
    for (const p of [...(c?.created ?? []), ...(c?.changed ?? [])]) changed.add(p);
  }
  if (changed.size) parts.push(`Recently changed files: ${[...changed].slice(0, 30).join(", ")}`);
  const errs = collectPreviewErrors(projectId);
  parts.push(`Preview status: ${errs.status}`);
  if (errs.problems.length) parts.push(`Current problems:\n${errs.problems.join("\n\n").slice(0, 4000)}`);
  return parts.join("\n\n");
}
