import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { sha256 } from "../crypto";
import { HttpError } from "../http";
import { IGNORED_DIRS, MAX_FILE_BYTES, PathError, isIgnoredPath, projectDir, resolveInProject } from "../paths";

export type FileEntry = { path: string; size: number; hash: string; updatedAt: Date };
export type TreeNode = { name: string; path: string; type: "file" | "dir"; children?: TreeNode[]; size?: number };
export type FileChanges = { created: string[]; changed: string[]; deleted: string[] };

function toHttp(e: unknown): never {
  if (e instanceof PathError) throw new HttpError(400, e.message);
  throw e;
}

export function emptyChanges(): FileChanges {
  return { created: [], changed: [], deleted: [] };
}

export function mergeChanges(into: FileChanges, from: FileChanges) {
  for (const k of ["created", "changed", "deleted"] as const) for (const p of from[k]) if (!into[k].includes(p)) into[k].push(p);
  // a file both created and changed counts as created
  into.changed = into.changed.filter((p) => !into.created.includes(p));
  into.created = into.created.filter((p) => !into.deleted.includes(p));
  into.changed = into.changed.filter((p) => !into.deleted.includes(p));
  return into;
}

function isProbablyText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

/** Writes the database copy of the project to disk (only files that differ). */
export async function materialize(projectId: string): Promise<void> {
  const root = projectDir(projectId);
  await fsp.mkdir(root, { recursive: true });
  const files = await db.projectFile.findMany({ where: { projectId }, select: { path: true, content: true, hash: true } });
  for (const f of files) {
    const { abs } = resolveInProject(projectId, f.path);
    let same = false;
    try {
      const cur = await fsp.readFile(abs);
      same = sha256(cur.toString("utf8")) === f.hash;
    } catch {
      same = false;
    }
    if (!same) {
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, f.content, "utf8");
    }
  }
}

async function walk(root: string, rel = "", out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 12) return out;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (IGNORED_DIRS.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) await walk(root, r, out, depth + 1);
    else if (e.isFile()) out.push(r);
    if (out.length > 5000) break;
  }
  return out;
}

/** Scans the workspace on disk and updates the database so it matches. Returns what changed. */
export async function syncFromDisk(projectId: string): Promise<FileChanges> {
  const root = projectDir(projectId);
  const changes = emptyChanges();
  if (!fs.existsSync(root)) return changes;
  const existing = new Map((await db.projectFile.findMany({ where: { projectId }, select: { path: true, hash: true } })).map((f) => [f.path, f.hash]));
  const onDisk = await walk(root);
  const seen = new Set<string>();
  for (const rel of onDisk) {
    const abs = path.join(root, rel);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;
    const buf = await fsp.readFile(abs);
    if (!isProbablyText(buf)) continue;
    seen.add(rel);
    const content = buf.toString("utf8");
    const hash = sha256(content);
    const prev = existing.get(rel);
    if (prev === hash) continue;
    await db.projectFile.upsert({
      where: { projectId_path: { projectId, path: rel } },
      create: { projectId, path: rel, content, hash, size: buf.length },
      update: { content, hash, size: buf.length },
    });
    if (prev === undefined) changes.created.push(rel);
    else changes.changed.push(rel);
  }
  for (const p of existing.keys()) {
    if (!seen.has(p)) {
      await db.projectFile.delete({ where: { projectId_path: { projectId, path: p } } }).catch(() => {});
      changes.deleted.push(p);
    }
  }
  if (changes.created.length || changes.changed.length || changes.deleted.length) {
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  }
  return changes;
}

export async function listFiles(projectId: string): Promise<FileEntry[]> {
  return db.projectFile.findMany({ where: { projectId }, select: { path: true, size: true, hash: true, updatedAt: true }, orderBy: { path: "asc" } });
}

export function buildTree(paths: { path: string; size?: number }[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  for (const f of paths) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLeaf = i === parts.length - 1;
      const p = parts.slice(0, i + 1).join("/");
      let child = node.children!.find((c) => c.name === name && c.type === (isLeaf ? "file" : "dir"));
      if (!child) {
        child = isLeaf ? { name, path: p, type: "file", size: f.size } : { name, path: p, type: "dir", children: [] };
        node.children!.push(child);
      }
      node = child;
    }
  }
  const sortRec = (n: TreeNode) => {
    n.children?.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    n.children?.forEach(sortRec);
  };
  sortRec(root);
  return root.children!;
}

export async function readFile(projectId: string, rel: string): Promise<{ path: string; content: string; hash: string }> {
  try {
    const { abs, rel: cleaned } = resolveInProject(projectId, rel);
    if (isIgnoredPath(cleaned)) throw new HttpError(400, "That path is not part of the project.");
    // Prefer disk (may be newer after a command); fall back to DB.
    try {
      const stat = await fsp.stat(abs);
      if (!stat.isFile()) throw new HttpError(404, "File not found.");
      if (stat.size > MAX_FILE_BYTES) throw new HttpError(413, "File is too large to open.");
      const buf = await fsp.readFile(abs);
      if (!isProbablyText(buf)) throw new HttpError(415, "Binary files can't be opened here.");
      const content = buf.toString("utf8");
      return { path: cleaned, content, hash: sha256(content) };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const row = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path: cleaned } } });
      if (!row) throw new HttpError(404, "File not found.");
      return { path: cleaned, content: row.content, hash: row.hash };
    }
  } catch (e) {
    toHttp(e);
  }
}

export type WriteResult = { path: string; hash: string; created: boolean };

/** Writes a file to disk and the database (write-through). */
export async function writeFile(projectId: string, rel: string, content: string, opts: { expectedHash?: string } = {}): Promise<WriteResult> {
  try {
    const { abs, rel: cleaned } = resolveInProject(projectId, rel);
    if (isIgnoredPath(cleaned)) throw new HttpError(400, "That path can't be edited.");
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new HttpError(413, "File is too large (max 1 MB).");
    const existing = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path: cleaned } }, select: { hash: true } });
    if (opts.expectedHash && existing && existing.hash !== opts.expectedHash) {
      throw new HttpError(409, "Your project changed somewhere else.", "conflict");
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, "utf8");
    const hash = sha256(content);
    await db.projectFile.upsert({
      where: { projectId_path: { projectId, path: cleaned } },
      create: { projectId, path: cleaned, content, hash, size: Buffer.byteLength(content) },
      update: { content, hash, size: Buffer.byteLength(content) },
    });
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return { path: cleaned, hash, created: !existing };
  } catch (e) {
    toHttp(e);
  }
}

export async function deleteFile(projectId: string, rel: string): Promise<string[]> {
  try {
    const { abs, rel: cleaned } = resolveInProject(projectId, rel);
    if (!cleaned) throw new HttpError(400, "Cannot delete the project root.");
    if (isIgnoredPath(cleaned)) throw new HttpError(400, "That path can't be deleted here.");
    const deleted: string[] = [];
    let isDir = false;
    try {
      isDir = (await fsp.stat(abs)).isDirectory();
    } catch {
      /* not on disk */
    }
    if (isDir) {
      const rows = await db.projectFile.findMany({ where: { projectId, path: { startsWith: cleaned + "/" } }, select: { path: true } });
      deleted.push(...rows.map((r) => r.path));
      await db.projectFile.deleteMany({ where: { projectId, path: { startsWith: cleaned + "/" } } });
      await fsp.rm(abs, { recursive: true, force: true });
    } else {
      const res = await db.projectFile.deleteMany({ where: { projectId, path: cleaned } });
      await fsp.rm(abs, { force: true });
      if (res.count > 0) deleted.push(cleaned);
    }
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return deleted;
  } catch (e) {
    toHttp(e);
  }
}

export async function renamePath(projectId: string, from: string, to: string): Promise<FileChanges> {
  try {
    const a = resolveInProject(projectId, from);
    const b = resolveInProject(projectId, to);
    if (!a.rel || !b.rel) throw new HttpError(400, "Invalid path.");
    if (isIgnoredPath(a.rel) || isIgnoredPath(b.rel)) throw new HttpError(400, "That path can't be renamed.");
    if (fs.existsSync(b.abs)) throw new HttpError(409, "Something already exists at that name.");
    if (!fs.existsSync(a.abs)) throw new HttpError(404, "File not found.");
    const isDir = fs.statSync(a.abs).isDirectory();
    await fsp.mkdir(path.dirname(b.abs), { recursive: true });
    await fsp.rename(a.abs, b.abs);
    const changes = emptyChanges();
    if (isDir) {
      const rows = await db.projectFile.findMany({ where: { projectId, path: { startsWith: a.rel + "/" } } });
      for (const r of rows) {
        const np = b.rel + r.path.slice(a.rel.length);
        await db.projectFile.update({ where: { id: r.id }, data: { path: np } });
        changes.deleted.push(r.path);
        changes.created.push(np);
      }
    } else {
      await db.projectFile.updateMany({ where: { projectId, path: a.rel }, data: { path: b.rel } });
      changes.deleted.push(a.rel);
      changes.created.push(b.rel);
    }
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return changes;
  } catch (e) {
    toHttp(e);
  }
}

export async function createFolder(projectId: string, rel: string): Promise<string> {
  try {
    const { abs, rel: cleaned } = resolveInProject(projectId, rel);
    if (!cleaned || isIgnoredPath(cleaned)) throw new HttpError(400, "Invalid folder name.");
    await fsp.mkdir(abs, { recursive: true });
    // Folders are implicit in the DB; keep a placeholder so they survive re-materialisation.
    await writeFile(projectId, `${cleaned}/.gitkeep`, "");
    return cleaned;
  } catch (e) {
    toHttp(e);
  }
}

export async function searchFiles(projectId: string, query: string, opts: { limit?: number; caseSensitive?: boolean } = {}) {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db.projectFile.findMany({ where: { projectId }, select: { path: true, content: true } });
  const results: { path: string; line: number; text: string }[] = [];
  const needle = opts.caseSensitive ? q : q.toLowerCase();
  for (const r of rows) {
    const lines = r.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const hay = opts.caseSensitive ? lines[i] : lines[i].toLowerCase();
      if (hay.includes(needle)) {
        results.push({ path: r.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

/** Creates the initial files for a new project (DB + disk). */
export async function seedFiles(projectId: string, files: Record<string, string>) {
  await db.projectFile.createMany({
    data: Object.entries(files).map(([p, content]) => ({ projectId, path: p, content, hash: sha256(content), size: Buffer.byteLength(content) })),
    skipDuplicates: true,
  });
  await materialize(projectId);
}

export async function snapshotFiles(projectId: string): Promise<Record<string, string>> {
  const rows = await db.projectFile.findMany({ where: { projectId }, select: { path: true, content: true } });
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

/** Replaces all project files with the given set (used by restore). */
export async function replaceAllFiles(projectId: string, files: Record<string, string>): Promise<void> {
  const root = projectDir(projectId);
  const current = await db.projectFile.findMany({ where: { projectId }, select: { path: true } });
  await db.$transaction([
    db.projectFile.deleteMany({ where: { projectId } }),
    db.projectFile.createMany({
      data: Object.entries(files).map(([p, content]) => ({ projectId, path: p, content, hash: sha256(content), size: Buffer.byteLength(content) })),
    }),
    db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }),
  ]);
  for (const f of current) {
    if (!(f.path in files)) {
      try {
        await fsp.rm(resolveInProject(projectId, f.path).abs, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  if (fs.existsSync(root)) await materialize(projectId);
}
