import "server-only";
import path from "node:path";
import { readFile } from "./files";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
};

/**
 * Serves a project's files straight from the database, for plain HTML/CSS/JS projects (no build step).
 * Used for the live preview on serverless hosts and for published static sites.
 */
export async function serveProjectFile(projectId: string, parts: string[], opts: { cache?: string; base?: string } = {}): Promise<Response> {
  if (parts.some((p) => p === ".." || p.includes("\0"))) return new Response("Not found", { status: 404 });
  let rel = parts.join("/");
  if (!rel || rel.endsWith("/")) rel = `${rel}index.html`;
  const attempts = [rel];
  if (!path.extname(rel)) attempts.push(`${rel}.html`, `${rel}/index.html`, "index.html"); // pretty URLs + SPA fallback
  for (const candidate of attempts) {
    try {
      const f = await readFile(projectId, candidate);
      const ext = path.extname(candidate).toLowerCase();
      const type = TYPES[ext] ?? "application/octet-stream";
      let body = f.content;
      // Relative links (styles.css, app.js) must resolve under the site's folder whatever the request URL looks like.
      if (ext === ".html" && opts.base && !/<base\s/i.test(body)) body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${opts.base}">`);
      return new Response(body, {
        headers: { "Content-Type": type, "Cache-Control": opts.cache ?? "no-store", "X-Content-Type-Options": "nosniff" },
      });
    } catch {
      /* try next */
    }
  }
  return new Response("Not found", { status: 404 });
}
