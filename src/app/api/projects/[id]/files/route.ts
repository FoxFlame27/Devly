import { z } from "zod";
import { json, parseBody } from "@/lib/http";
import { projectRoute } from "@/lib/api/project-route";
import { buildTree, createFolder, deleteFile, listFiles, readFile, renamePath, writeFile } from "@/lib/projects/files";

// GET ?path=... reads a file; GET without path returns the tree.
export const GET = projectRoute(async (req, { project }) => {
  const url = new URL(req.url);
  const p = url.searchParams.get("path");
  if (p) {
    const file = await readFile(project.id, p);
    return json({ file });
  }
  const files = await listFiles(project.id);
  return json({ tree: buildTree(files), count: files.length });
});

const writeSchema = z.object({
  path: z.string().min(1).max(512),
  content: z.string().max(1_000_000),
  expectedHash: z.string().max(64).optional(),
  force: z.boolean().optional(),
});

export const POST = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, writeSchema);
  const r = await writeFile(project.id, body.path, body.content, { expectedHash: body.force ? undefined : body.expectedHash });
  return json({ file: r });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), from: z.string().min(1).max(512), to: z.string().min(1).max(512) }),
  z.object({ action: z.literal("mkdir"), path: z.string().min(1).max(512) }),
]);

export const PATCH = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, patchSchema);
  if (body.action === "rename") return json({ changes: await renamePath(project.id, body.from, body.to) });
  return json({ path: await createFolder(project.id, body.path) });
});

export const DELETE = projectRoute(async (req, { project }) => {
  const body = await parseBody(req, z.object({ path: z.string().min(1).max(512) }));
  return json({ deleted: await deleteFile(project.id, body.path) });
});
