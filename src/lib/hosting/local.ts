import "server-only";
import fsp from "node:fs/promises";
import path from "node:path";
import { publishedDir } from "../paths";
import { env } from "../env";
import type { HostingProvider, PublishResult } from "./types";

/** Serves published sites from this server under /site/<slug>/ on a separate origin (SITE_URL). */
export class LocalHosting implements HostingProvider {
  readonly name = "local";

  basePath(slug: string) {
    return `/site/${slug}/`;
  }

  async publish(_projectId: string, buildDir: string, slug: string): Promise<PublishResult> {
    const target = path.join(publishedDir(), slug);
    const tmp = `${target}.tmp-${Date.now()}`;
    await fsp.cp(buildDir, tmp, { recursive: true, dereference: false, filter: (src) => !path.basename(src).startsWith(".") });
    await fsp.rm(target, { recursive: true, force: true });
    await fsp.rename(tmp, target);
    return { url: `${siteOrigin()}${this.basePath(slug).replace(/\/$/, "")}`, slug };
  }

  async unpublish(slug: string) {
    await fsp.rm(path.join(publishedDir(), slug), { recursive: true, force: true });
  }
}

/** Published sites run user code, so they are served from a different origin than the app (no shared cookies). */
export function siteOrigin(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const app = new URL(env().APP_URL);
  const host = app.hostname === "localhost" ? "127.0.0.1" : app.hostname;
  return `${app.protocol}//${host}${app.port ? `:${app.port}` : ""}`;
}
