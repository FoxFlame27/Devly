import fsp from "node:fs/promises";
import path from "node:path";
import { projectRoute } from "@/lib/api/project-route";
import { HttpError } from "@/lib/http";
import { PathError, resolveInProject } from "@/lib/paths";

const TYPES: Record<string, string> = { ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

/** Serves a binary asset from the project's public/ folder (used for 3D model previews in the workspace). */
export const GET = projectRoute(async (req, { project }) => {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  let abs: string;
  let cleaned: string;
  try {
    ({ abs, rel: cleaned } = resolveInProject(project.id, rel));
  } catch (e) {
    throw new HttpError(400, e instanceof PathError ? e.message : "Invalid path.");
  }
  if (!cleaned.startsWith("public/")) throw new HttpError(403, "Only files in public/ can be loaded.");
  const type = TYPES[path.extname(cleaned).toLowerCase()];
  if (!type) throw new HttpError(415, "Unsupported file type.");
  try {
    const data = await fsp.readFile(abs);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch {
    throw new HttpError(404, "File not found.");
  }
});
