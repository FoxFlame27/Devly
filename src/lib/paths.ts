import "server-only";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";

/** Root of the platform checkout. Project sandboxes must never read it (except their own workspace). */
export const APP_ROOT = process.cwd();

export function dataDir(): string {
  const d = env().DATA_DIR ? path.resolve(env().DATA_DIR!) : path.join(APP_ROOT, ".data");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function workspacesDir(): string {
  const d = path.join(dataDir(), "workspaces");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function sandboxHomesDir(): string {
  const d = path.join(dataDir(), "homes");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function npmCacheDir(): string {
  const d = path.join(dataDir(), "npm-cache");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function publishedDir(): string {
  const d = path.join(dataDir(), "published");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function assertProjectId(projectId: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(projectId)) throw new Error("Invalid project id");
}

export function projectDir(projectId: string): string {
  assertProjectId(projectId);
  return path.join(workspacesDir(), projectId);
}

export function projectHomeDir(projectId: string): string {
  assertProjectId(projectId);
  const d = path.join(sandboxHomesDir(), projectId);
  fs.mkdirSync(path.join(d, "tmp"), { recursive: true });
  return d;
}

export class PathError extends Error {}

/** Resolves a user/AI supplied relative path inside a project. Rejects traversal, absolute paths and symlink escapes. */
export function resolveInProject(projectId: string, relPath: string): { abs: string; rel: string } {
  if (typeof relPath !== "string") throw new PathError("Path must be a string");
  if (relPath.length > 512) throw new PathError("Path is too long");
  if (relPath.includes("\0")) throw new PathError("Invalid path");
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) throw new PathError("Absolute paths are not allowed");
  const segments = cleaned.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.some((s) => s === "..")) throw new PathError("Path traversal is not allowed");
  const root = projectDir(projectId);
  const abs = path.resolve(root, ...segments);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new PathError("Path escapes the project");
  // Symlink escape check: walk existing ancestors
  let probe = abs;
  while (probe.length > root.length) {
    try {
      const real = fs.realpathSync(probe);
      const realRoot = fs.realpathSync(root);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new PathError("Path escapes the project");
      break;
    } catch (e) {
      if (e instanceof PathError) throw e;
      probe = path.dirname(probe);
    }
  }
  return { abs, rel: segments.join("/") };
}

/** Paths that are never tracked or exposed to the AI/editor. */
export const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".turbo", ".cache", "build", ".vite", "coverage"]);
export const MAX_FILE_BYTES = 1_000_000;

export function isIgnoredPath(rel: string): boolean {
  return rel.split("/").some((seg) => IGNORED_DIRS.has(seg));
}
