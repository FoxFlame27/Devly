import "server-only";
import { HttpError } from "./http";

/** Vercel REST client: deploy a project's files to the user's own Vercel account and manage custom domains. */
const API = "https://api.vercel.com";

async function vc<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 || res.status === 403) throw new HttpError(401, `Vercel rejected the token${err?.message ? `: ${err.message}` : ""}. Add a new one in Settings → Hosting.`, "vercel_token");
    throw new HttpError(502, `Vercel error: ${err?.message ?? text.slice(0, 200)}`, err?.code);
  }
  return data as T;
}

export async function vercelUser(token: string): Promise<{ username: string; name?: string }> {
  const r = await vc<{ user: { username: string; name?: string } }>(token, "GET", "/v2/user");
  return r.user;
}

export type DeployFile = { file: string; data: string };
export type Framework = "vite" | "nextjs" | null;

export function slugForVercel(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
  return `${base}-${id.slice(-6)}`;
}

async function ensureProject(token: string, name: string, framework: Framework, env: Record<string, string>) {
  let exists = true;
  try {
    await vc(token, "GET", `/v9/projects/${name}`);
  } catch (e) {
    if (e instanceof HttpError && /not.?found/i.test(e.message)) exists = false;
    else throw e;
  }
  if (!exists) await vc(token, "POST", "/v11/projects", { name, framework });
  const entries = Object.entries(env).filter(([, v]) => v);
  if (entries.length) {
    await vc(token, "POST", `/v10/projects/${name}/env?upsert=true`, entries.map(([key, value]) => ({ key, value, type: "encrypted", target: ["production", "preview"] })));
  }
}

/** Uploads files and waits for the build. Returns the live URL or the build error. */
export async function deployProject(
  token: string,
  opts: { name: string; files: DeployFile[]; framework: Framework; env: Record<string, string>; onProgress?: (msg: string) => void; signal?: AbortSignal },
): Promise<{ ok: true; url: string; deploymentId: string } | { ok: false; error: string; logs: string }> {
  opts.onProgress?.("Preparing the project on Vercel...");
  await ensureProject(token, opts.name, opts.framework, opts.env);
  opts.onProgress?.("Uploading files...");
  const settings = opts.framework ? { framework: opts.framework } : { framework: null, buildCommand: null, outputDirectory: null, installCommand: null };
  const dep = await vc<{ id: string; url: string; readyState: string }>(token, "POST", "/v13/deployments", {
    name: opts.name,
    project: opts.name,
    target: "production",
    files: opts.files.map((f) => ({ file: f.file, data: f.data, encoding: "utf-8" })),
    projectSettings: settings,
  });
  const started = Date.now();
  let state = dep.readyState;
  let last = "";
  while (state !== "READY" && state !== "ERROR" && state !== "CANCELED") {
    if (opts.signal?.aborted) throw new Error("Cancelled");
    if (Date.now() - started > 8 * 60 * 1000) return { ok: false, error: "The build is taking too long. Check the Vercel dashboard.", logs: "" };
    await new Promise((r) => setTimeout(r, 4000));
    const d = await vc<{ readyState: string; readySubstate?: string }>(token, "GET", `/v13/deployments/${dep.id}`);
    state = d.readyState;
    const label = state === "QUEUED" ? "Waiting for a build slot..." : state === "BUILDING" ? "Building on Vercel..." : state === "INITIALIZING" ? "Starting the build..." : `Vercel: ${state.toLowerCase()}...`;
    if (label !== last) {
      last = label;
      opts.onProgress?.(label);
    }
  }
  if (state !== "READY") {
    const events = await vc<{ type: string; payload?: { text?: string } }[]>(token, "GET", `/v3/deployments/${dep.id}/events?builds=1&limit=200`).catch(() => []);
    const lines = (Array.isArray(events) ? events : []).map((e) => e.payload?.text ?? "").filter(Boolean);
    const logs = lines.slice(-60).join("\n");
    const errLine = [...lines].reverse().find((l) => /error|failed|cannot|not found/i.test(l)) ?? "The build failed.";
    return { ok: false, error: errLine.slice(0, 300), logs: logs.slice(-6000) };
  }
  const info = await vc<{ alias?: string[]; url: string }>(token, "GET", `/v13/deployments/${dep.id}`);
  const aliases = info.alias ?? [];
  const primary = aliases.find((a) => a.endsWith(".vercel.app") && !a.includes("-git-") && a.split("-").length <= 4) ?? aliases.find((a) => a.endsWith(".vercel.app")) ?? aliases[0] ?? info.url;
  return { ok: true, url: `https://${primary}`, deploymentId: dep.id };
}

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };
export type DomainStatus = { domain: string; verified: boolean; configured: boolean; records: DnsRecord[]; note?: string };

function recordsFor(domain: string, apex: string, verification?: { type: string; domain: string; value: string }[]): DnsRecord[] {
  const records: DnsRecord[] = [];
  if (domain === apex) records.push({ type: "A", name: "@", value: "76.76.21.21" });
  else records.push({ type: "CNAME", name: domain.slice(0, -(apex.length + 1)), value: "cname.vercel-dns.com" });
  for (const v of verification ?? []) if (v.type === "TXT") records.push({ type: "TXT", name: v.domain.endsWith(apex) ? v.domain.slice(0, -(apex.length + 1)) || "@" : v.domain, value: v.value });
  return records;
}

/** Adds a custom domain to the project and returns what DNS records the person must set. */
export async function addDomain(token: string, project: string, domain: string): Promise<DomainStatus> {
  const d = await vc<{ name: string; apexName: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] }>(token, "POST", `/v10/projects/${project}/domains`, { name: domain }).catch(async (e) => {
    if (e instanceof HttpError && /already|exists|in use/i.test(e.message)) return vc<{ name: string; apexName: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] }>(token, "GET", `/v9/projects/${project}/domains/${domain}`);
    throw e;
  });
  return domainStatus(token, project, domain, d);
}

export async function domainStatus(token: string, project: string, domain: string, known?: { name: string; apexName: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] }): Promise<DomainStatus> {
  const d = known ?? (await vc<{ name: string; apexName: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] }>(token, "GET", `/v9/projects/${project}/domains/${domain}`));
  if (!d.verified) await vc(token, "POST", `/v9/projects/${project}/domains/${domain}/verify`).catch(() => {});
  const cfg = await vc<{ misconfigured: boolean }>(token, "GET", `/v6/domains/${domain}/config`).catch(() => ({ misconfigured: true }));
  const fresh = await vc<{ verified: boolean; verification?: { type: string; domain: string; value: string }[] }>(token, "GET", `/v9/projects/${project}/domains/${domain}`).catch(() => d);
  const records = recordsFor(d.name, d.apexName, fresh.verified ? undefined : fresh.verification);
  const configured = !cfg.misconfigured;
  return {
    domain: d.name,
    verified: fresh.verified,
    configured,
    records,
    note: configured && fresh.verified ? "Working. HTTPS is set up automatically." : !fresh.verified ? "Waiting for the TXT record (the domain is used by another account)." : "Waiting for DNS. Changes can take up to an hour to spread.",
  };
}

export async function removeDomain(token: string, project: string, domain: string) {
  await vc(token, "DELETE", `/v9/projects/${project}/domains/${domain}`).catch(() => {});
}
