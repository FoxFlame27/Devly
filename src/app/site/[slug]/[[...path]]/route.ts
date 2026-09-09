import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { publishedDir } from "@/lib/paths";
import { env } from "@/lib/env";
import { siteOrigin } from "@/lib/hosting/local";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wasm": "application/wasm", ".map": "application/json", ".xml": "application/xml",
};

/** Serves published sites. Runs on a separate origin from the app so site scripts never share the app's cookies. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path: parts = [] } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const appHost = new URL(env().APP_URL).host;
  const site = new URL(siteOrigin());
  if (requestHost === appHost && site.host !== appHost) {
    return Response.redirect(`${siteOrigin()}${url.pathname}${url.search}`, 307);
  }
  const root = path.join(publishedDir(), slug);
  if (!fs.existsSync(root)) return new Response("This site isn't published.", { status: 404 });
  if (parts.some((p) => p === ".." || p.includes("\0"))) return new Response("Not found", { status: 404 });
  let target = path.resolve(root, ...parts);
  if (!target.startsWith(root + path.sep) && target !== root) return new Response("Not found", { status: 404 });
  try {
    let st = await fsp.stat(target).catch(() => null);
    if (st?.isDirectory()) {
      target = path.join(target, "index.html");
      st = await fsp.stat(target).catch(() => null);
    }
    if (!st) {
      const htmlAlt = `${target}.html`;
      if (fs.existsSync(htmlAlt)) target = htmlAlt;
      else target = path.join(root, "index.html"); // SPA fallback
      st = await fsp.stat(target).catch(() => null);
      if (!st) return new Response("Not found", { status: 404 });
    }
    const real = await fsp.realpath(target);
    if (!real.startsWith((await fsp.realpath(root)) + path.sep)) return new Response("Not found", { status: 404 });
    const data = await fsp.readFile(target);
    const type = TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    // Node's Buffer is not a valid BodyInit for the web Response type on every toolchain; hand over a plain byte view.
    return new Response(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), {
      headers: { "Content-Type": type, "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
