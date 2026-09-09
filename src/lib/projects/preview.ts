import "server-only";
import { isServerless } from "../serverless";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { db } from "../db";
import { sha256 } from "../crypto";
import { getSandbox } from "../sandbox";
import type { ServiceHandle } from "../sandbox/types";
import { projectDir, projectHomeDir, sandboxHomesDir } from "../paths";
import { materialize, syncFromDisk } from "./files";
import { getTemplate } from "./templates";
import { projectEnv } from "./env-vars";

export type PreviewStatus = "stopped" | "installing" | "starting" | "running" | "error";

export type RuntimeError = { kind: "error" | "compile"; message: string; stack?: string; at: number };

type PreviewState = {
  projectId: string;
  status: PreviewStatus;
  port: number | null;
  url: string | null;
  handle: ServiceHandle | null;
  logs: string[];
  runtimeErrors: RuntimeError[];
  lastError: string | null;
  startedAt: number | null;
  op: Promise<void> | null;
  version: number;
};

const g = globalThis as unknown as { __previews?: Map<string, PreviewState>; __previewSwept?: boolean };
const registry = (g.__previews ??= new Map<string, PreviewState>());

const PORT_MIN = 4100;
const PORT_MAX = 4999;
const MAX_LOG_LINES = 400;
export const PREVIEW_HOST = "127.0.0.1";

/** On serverless hosts the preview is the project's own files served from the database (plain HTML projects). */
function staticInfo(projectId: string): PreviewInfo {
  const s = state(projectId);
  s.status = "running";
  s.url = `/api/projects/${projectId}/static`;
  return { status: "running", url: s.url, port: null, lastError: null, runtimeErrors: s.runtimeErrors.slice(-5), version: s.version, uptimeMs: null };
}

function state(projectId: string): PreviewState {
  let s = registry.get(projectId);
  if (!s) {
    s = { projectId, status: "stopped", port: null, url: null, handle: null, logs: [], runtimeErrors: [], lastError: null, startedAt: null, op: null, version: 0 };
    registry.set(projectId, s);
  }
  return s;
}

function appendLog(s: PreviewState, chunk: string, stream: "stdout" | "stderr") {
  const lines = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").split(/\r?\n/).filter((l) => l.trim().length);
  for (const l of lines) s.logs.push(`${stream === "stderr" ? "! " : "  "}${l}`);
  if (s.logs.length > MAX_LOG_LINES) s.logs.splice(0, s.logs.length - MAX_LOG_LINES);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, PREVIEW_HOST, () => srv.close(() => resolve(true)));
  });
}

async function allocatePort(): Promise<number> {
  const used = new Set([...registry.values()].map((s) => s.port).filter((p): p is number => p !== null));
  for (let attempt = 0; attempt < 200; attempt++) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN));
    if (used.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free preview port");
}

function waitForPort(port: number, timeoutMs: number, exited: Promise<number | null>): Promise<"up" | "exited" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    let done = false;
    exited.then(() => {
      if (!done) {
        done = true;
        resolve("exited");
      }
    });
    const tick = () => {
      if (done) return;
      if (Date.now() > deadline) {
        done = true;
        return resolve("timeout");
      }
      const sock = net.connect({ port, host: PREVIEW_HOST });
      sock.once("connect", () => {
        sock.destroy();
        if (!done) {
          done = true;
          resolve("up");
        }
      });
      sock.once("error", () => {
        sock.destroy();
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function pidFile(projectId: string) {
  return path.join(projectHomeDir(projectId), "preview.pid");
}

/** Kills dev servers left over from a previous platform process (pid files). Runs once. */
function sweepStale() {
  if (g.__previewSwept) return;
  g.__previewSwept = true;
  try {
    for (const id of fs.readdirSync(sandboxHomesDir())) {
      const f = path.join(sandboxHomesDir(), id, "preview.pid");
      if (!fs.existsSync(f)) continue;
      const pid = Number(fs.readFileSync(f, "utf8"));
      if (pid > 1) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
      fs.rmSync(f, { force: true });
    }
  } catch {
    /* ignore */
  }
}

async function installHashFile(projectId: string) {
  return path.join(projectHomeDir(projectId), "installed.hash");
}

function currentDepsHash(projectId: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir(projectId), "package.json"), "utf8"));
    return sha256(JSON.stringify({ d: pkg.dependencies ?? {}, dd: pkg.devDependencies ?? {} }));
  } catch {
    return null;
  }
}

/** Installs dependencies when package.json changed or node_modules is missing. */
export async function ensureInstalled(projectId: string, onOutput?: (line: string) => void): Promise<{ ok: boolean; output: string }> {
  if (isServerless()) return { ok: true, output: "" };
  const s = state(projectId);
  // Tools inside the sandbox leave caches in its private HOME; they are safe to drop and disk is scarce.
  for (const junk of ["Library", "tmp", ".cache"]) fs.rmSync(path.join(projectHomeDir(projectId), junk), { recursive: true, force: true });
  fs.mkdirSync(path.join(projectHomeDir(projectId), "tmp"), { recursive: true });
  const hash = currentDepsHash(projectId);
  if (!hash) return { ok: true, output: "" };
  const hf = await installHashFile(projectId);
  const nm = path.join(projectDir(projectId), "node_modules");
  const prev = fs.existsSync(hf) ? fs.readFileSync(hf, "utf8") : "";
  if (prev === hash && fs.existsSync(nm)) return { ok: true, output: "" };
  const prevStatus = s.status;
  s.status = "installing";
  s.version++;
  appendLog(s, "Installing packages...", "stdout");
  const env = await projectEnv(projectId);
  const res = await getSandbox().exec(projectId, "npm install --no-audit --no-fund", {
    timeoutMs: 600_000,
    env,
    onOutput: (chunk, stream) => {
      appendLog(s, chunk, stream);
      onOutput?.(chunk);
    },
  });
  if (res.exitCode === 0) {
    await fsp.writeFile(hf, hash, "utf8");
    appendLog(s, "Packages installed.", "stdout");
    s.status = prevStatus === "running" ? "running" : "stopped";
    await syncFromDisk(projectId); // picks up package-lock.json
    return { ok: true, output: res.stdout };
  }
  s.status = "error";
  s.lastError = `Package installation failed:\n${(res.stderr || res.stdout).slice(-3000)}`;
  s.version++;
  return { ok: false, output: `${res.stdout}\n${res.stderr}` };
}

async function stopInternal(s: PreviewState) {
  if (s.handle) {
    const h = s.handle;
    s.handle = null;
    await h.stop();
  }
  fs.rmSync(pidFile(s.projectId), { force: true });
  s.status = "stopped";
  s.port = null;
  s.url = null;
  s.startedAt = null;
  s.version++;
}

export async function stopPreview(projectId: string) {
  if (isServerless()) return;
  const s = state(projectId);
  await stopInternal(s);
}

/** Starts (or restarts) the project's dev server in the sandbox. Serialised per project. */
export async function startPreview(projectId: string): Promise<PreviewInfo> {
  if (isServerless()) return staticInfo(projectId);
  sweepStale();
  const s = state(projectId);
  const run = async () => {
    await stopInternal(s);
    s.runtimeErrors = [];
    s.lastError = null;
    s.logs = [];
    await materialize(projectId);
    const project = await db.project.findUnique({ where: { id: projectId }, select: { template: true } });
    const template = getTemplate(project?.template);
    const install = await ensureInstalled(projectId);
    if (!install.ok) return;
    const port = await allocatePort();
    s.status = "starting";
    s.port = port;
    s.version++;
    const env = await projectEnv(projectId);
    const command = template.devCommand.replace(/\$PORT/g, String(port));
    const handle = await getSandbox().startService(projectId, command, {
      port,
      env,
      onOutput: (chunk, stream) => appendLog(s, chunk, stream),
    });
    s.handle = handle;
    if (handle.pid) fs.writeFileSync(pidFile(projectId), String(handle.pid));
    handle.exited.then((code) => {
      if (s.handle === handle) {
        s.handle = null;
        if (s.status !== "stopped") {
          s.status = "error";
          s.lastError = `The project stopped unexpectedly (exit code ${code}).\n${s.logs.slice(-15).join("\n")}`;
          s.version++;
        }
      }
    });
    const result = await waitForPort(port, 120_000, handle.exited);
    if (result === "up" && s.handle === handle) {
      s.status = "running";
      s.url = `http://${PREVIEW_HOST}:${port}`;
      s.startedAt = Date.now();
      s.version++;
    } else if (s.handle === handle) {
      s.status = "error";
      s.lastError = result === "exited" ? `The project couldn't start.\n${s.logs.slice(-20).join("\n")}` : "The project took too long to start.";
      s.version++;
      await stopInternal(s).catch(() => {});
      s.status = "error";
    }
  };
  const op = (s.op ?? Promise.resolve()).then(run, run);
  s.op = op;
  await op;
  if (s.op === op) s.op = null;
  return previewInfo(projectId);
}

export async function ensureRunning(projectId: string): Promise<PreviewInfo> {
  if (isServerless()) return staticInfo(projectId);
  const s = state(projectId);
  if (s.op) await s.op.catch(() => {});
  if (s.status === "running" && s.handle) return previewInfo(projectId);
  return startPreview(projectId);
}

export type PreviewInfo = {
  status: PreviewStatus;
  url: string | null;
  port: number | null;
  lastError: string | null;
  runtimeErrors: RuntimeError[];
  version: number;
  uptimeMs: number | null;
};

export function previewInfo(projectId: string): PreviewInfo {
  if (isServerless()) return staticInfo(projectId);
  const s = state(projectId);
  return {
    status: s.status,
    url: s.url,
    port: s.port,
    lastError: s.lastError,
    runtimeErrors: s.runtimeErrors.slice(-5),
    version: s.version,
    uptimeMs: s.startedAt ? Date.now() - s.startedAt : null,
  };
}

export function previewLogs(projectId: string, limit = 200): string[] {
  return state(projectId).logs.slice(-limit);
}

export function reportRuntimeError(projectId: string, err: Omit<RuntimeError, "at"> | { kind: "clear" | "ready" }) {
  const s = state(projectId);
  if (err.kind === "clear") {
    s.runtimeErrors = s.runtimeErrors.filter((e) => e.kind !== "compile");
    s.version++;
    return;
  }
  if (err.kind === "ready") return;
  const incoming = err as Omit<RuntimeError, "at">;
  const last = s.runtimeErrors[s.runtimeErrors.length - 1];
  if (last && last.message === incoming.message && Date.now() - last.at < 5000) return;
  s.runtimeErrors.push({ ...incoming, at: Date.now() });
  if (s.runtimeErrors.length > 20) s.runtimeErrors.splice(0, s.runtimeErrors.length - 20);
  s.version++;
}

/** Errors visible from the outside: process crashes, error lines in logs and browser-reported errors. */
export function collectPreviewErrors(projectId: string): { status: PreviewStatus; problems: string[] } {
  const s = state(projectId);
  const problems: string[] = [];
  if (s.lastError) problems.push(s.lastError);
  const recent = s.logs.slice(-80);
  const errLines = recent.filter((l) => /\b(error|failed|cannot|unexpected|not found|ENOENT|EADDRINUSE)\b/i.test(l) && !/warn/i.test(l));
  if (errLines.length) problems.push(`Recent error output from the dev server:\n${errLines.slice(-15).join("\n")}`);
  for (const e of s.runtimeErrors.slice(-5)) {
    problems.push(`${e.kind === "compile" ? "Compile error shown in the browser" : "Runtime error in the browser"}: ${e.message}${e.stack ? `\n${e.stack.split("\n").slice(0, 6).join("\n")}` : ""}`);
  }
  return { status: s.status, problems };
}

export function allPreviewStates() {
  return [...registry.values()].map((s) => ({ projectId: s.projectId, status: s.status, port: s.port, uptimeMs: s.startedAt ? Date.now() - s.startedAt : null }));
}

/** Records that node_modules matches package.json (after a successful install by a tool). */
export function markInstalled(projectId: string) {
  const hash = currentDepsHash(projectId);
  if (hash) fs.writeFileSync(path.join(projectHomeDir(projectId), "installed.hash"), hash, "utf8");
}
