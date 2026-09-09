import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveInProject } from "./paths";
import { writeFile, readFile } from "./projects/files";

/** Meshy AI client: text-to-3D (preview + refine) and retexture, with polling and download into the project. */
const BASE = "https://api.meshy.ai";

export type ModelEntry = { name: string; file: string; thumbnail: string | null; taskId: string; prompt: string; textured: boolean; createdAt: string };
export const MODELS_INDEX = "public/models/models.json";

function key(): string {
  const k = process.env.MESHY_API_KEY;
  if (!k) throw new Error("3D generation isn't set up (MESHY_API_KEY missing).");
  return k;
}

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method, headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? text.slice(0, 200);
    if (res.status === 402) throw new Error("The Meshy account has run out of credits.");
    throw new Error(`Meshy error ${res.status}: ${msg}`);
  }
  return data as T;
}

type Task = { id: string; status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED"; progress: number; model_urls?: { glb?: string }; thumbnail_url?: string; task_error?: { message?: string } };

async function poll(url: string, signal: AbortSignal | undefined, onProgress?: (p: number) => void, timeoutMs = 12 * 60 * 1000): Promise<Task> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Cancelled");
    const t = await call<Task>("GET", url, undefined, signal);
    onProgress?.(t.progress ?? 0);
    if (t.status === "SUCCEEDED") return t;
    if (t.status === "FAILED" || t.status === "CANCELED") throw new Error(`Meshy could not finish the model${t.task_error?.message ? `: ${t.task_error.message}` : "."}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Meshy took too long. Try again in a few minutes.");
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "model";
}

async function download(url: string, abs: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Couldn't download the model file.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 60 * 1024 * 1024) throw new Error("Model file is too large.");
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buf);
  return buf.length;
}

export async function readModelsIndex(projectId: string): Promise<ModelEntry[]> {
  try {
    const f = await readFile(projectId, MODELS_INDEX);
    const parsed = JSON.parse(f.content) as ModelEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveIndex(projectId: string, entries: ModelEntry[]) {
  await writeFile(projectId, MODELS_INDEX, JSON.stringify(entries, null, 2));
}

/** Creates a model from text (preview, then optionally refine for textures) and stores it under public/models/. */
export async function generateModel(
  projectId: string,
  opts: { name: string; prompt: string; style?: "realistic" | "cartoon" | "lowpoly"; textured: boolean; signal?: AbortSignal; onProgress?: (label: string) => void },
): Promise<ModelEntry> {
  const slug = slugify(opts.name);
  opts.onProgress?.("Creating the 3D shape...");
  const preview = await call<{ result: string }>("POST", "/openapi/v2/text-to-3d", { mode: "preview", prompt: opts.prompt.slice(0, 800), art_style: opts.style === "lowpoly" ? "realistic" : (opts.style ?? "realistic"), model_type: opts.style === "lowpoly" ? "lowpoly" : "standard", ai_model: "latest", should_remesh: true }, opts.signal);
  let task = await poll(`/openapi/v2/text-to-3d/${preview.result}`, opts.signal, (p) => opts.onProgress?.(`Creating the 3D shape... ${p}%`));
  let taskId = preview.result;
  if (opts.textured) {
    opts.onProgress?.("Painting textures...");
    const refine = await call<{ result: string }>("POST", "/openapi/v2/text-to-3d", { mode: "refine", preview_task_id: preview.result, enable_pbr: true }, opts.signal);
    task = await poll(`/openapi/v2/text-to-3d/${refine.result}`, opts.signal, (p) => opts.onProgress?.(`Painting textures... ${p}%`));
    taskId = refine.result;
  }
  if (!task.model_urls?.glb) throw new Error("Meshy didn't return a model file.");
  const file = `public/models/${slug}.glb`;
  const { abs } = resolveInProject(projectId, file);
  opts.onProgress?.("Saving the model...");
  await download(task.model_urls.glb, abs, opts.signal);
  let thumbnail: string | null = null;
  if (task.thumbnail_url) {
    try {
      const t = `public/models/${slug}.png`;
      await download(task.thumbnail_url, resolveInProject(projectId, t).abs, opts.signal);
      thumbnail = t;
    } catch {
      thumbnail = null;
    }
  }
  const entry: ModelEntry = { name: opts.name, file, thumbnail, taskId, prompt: opts.prompt, textured: opts.textured, createdAt: new Date().toISOString() };
  const index = (await readModelsIndex(projectId)).filter((e) => e.file !== file);
  index.push(entry);
  await saveIndex(projectId, index);
  return entry;
}

/** Re-textures an existing generated model with a text style prompt. */
export async function textureModel(projectId: string, opts: { name: string; prompt: string; signal?: AbortSignal; onProgress?: (label: string) => void }): Promise<ModelEntry> {
  const index = await readModelsIndex(projectId);
  const slug = slugify(opts.name);
  const entry = index.find((e) => slugify(e.name) === slug || e.file === `public/models/${slug}.glb`);
  if (!entry) throw new Error(`No generated model called "${opts.name}". Known models: ${index.map((e) => e.name).join(", ") || "none"}.`);
  opts.onProgress?.("Painting new textures...");
  const created = await call<{ result: string }>("POST", "/openapi/v1/retexture", { input_task_id: entry.taskId, text_style_prompt: opts.prompt.slice(0, 800), enable_pbr: true, ai_model: "latest" }, opts.signal);
  const task = await poll(`/openapi/v1/retexture/${created.result}`, opts.signal, (p) => opts.onProgress?.(`Painting new textures... ${p}%`));
  if (!task.model_urls?.glb) throw new Error("Meshy didn't return a model file.");
  const { abs } = resolveInProject(projectId, entry.file);
  await download(task.model_urls.glb, abs, opts.signal);
  if (task.thumbnail_url) {
    try {
      const t = `public/models/${slug}.png`;
      await download(task.thumbnail_url, resolveInProject(projectId, t).abs, opts.signal);
      entry.thumbnail = t;
    } catch {
      /* keep old */
    }
  }
  entry.textured = true;
  entry.prompt = `${entry.prompt} | texture: ${opts.prompt}`;
  entry.createdAt = new Date().toISOString();
  await saveIndex(projectId, index);
  return entry;
}

export function meshyConfigured(): boolean {
  return !!process.env.MESHY_API_KEY;
}

export function modelFileExists(projectId: string, file: string): boolean {
  try {
    return fs.existsSync(resolveInProject(projectId, file).abs);
  } catch {
    return false;
  }
}
