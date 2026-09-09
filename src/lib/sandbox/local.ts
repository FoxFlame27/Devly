import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT, npmCacheDir, projectDir, projectHomeDir } from "../paths";
import type { ExecOptions, ExecResult, SandboxProvider, ServiceHandle, ServiceOptions } from "./types";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const NODE_DIR = path.dirname(path.dirname(process.execPath));

function hasSeatbelt(): boolean {
  return process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC);
}

function sbPath(p: string): string {
  return fs.realpathSync(p).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Builds a macOS Seatbelt profile: deny everything, then allow reading the OS + node,
 * and reading/writing only the project workspace, its private home dir and the shared npm cache.
 * The platform checkout (including .env), other projects and the user's home are explicitly denied.
 */
function seatbeltProfile(projectId: string): string {
  const proj = sbPath(projectDir(projectId));
  const home = sbPath(projectHomeDir(projectId));
  const cache = sbPath(npmCacheDir());
  const node = sbPath(NODE_DIR);
  const appRoot = sbPath(APP_ROOT);
  const userHome = sbPath(process.env.HOME ?? "/nonexistent");
  return `(version 1)
(deny default)
(allow process-exec* process-fork)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix*)
(allow network*)
(allow file-read-metadata)
(allow file-ioctl (subpath "/dev"))
(allow file-read*
  (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/System") (subpath "/Library")
  (subpath "/private/etc") (subpath "/private/var/db") (subpath "/private/var/run") (subpath "/dev")
  (literal "/") (literal "/private") (literal "/private/tmp") (literal "/tmp") (literal "/var") (literal "/private/var") (literal "/etc"))
; Later rules win: deny the user's home and the platform checkout, then re-allow only what the project needs.
(deny file-read* (subpath "${userHome}"))
(deny file-read* (subpath "${appRoot}"))
(allow file-read* (subpath "${node}") (subpath "${proj}") (subpath "${home}") (subpath "${cache}"))
(allow file-write* (subpath "${proj}") (subpath "${home}") (subpath "${cache}") (literal "/dev/null") (regex #"^/dev/tty") (regex #"^/dev/fd/"))
(allow file-write-data (literal "/dev/stdout") (literal "/dev/stderr"))
`;
}

function scrubbedEnv(projectId: string, extra?: Record<string, string>): Record<string, string> {
  const home = projectHomeDir(projectId);
  const base: Record<string, string> = {
    PATH: `${path.join(NODE_DIR, "bin")}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: home,
    TMPDIR: path.join(home, "tmp"),
    npm_config_cache: npmCacheDir(),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_progress: "false",
    npm_config_loglevel: "error",
    NODE_OPTIONS: "--max-old-space-size=1024",
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    LANG: "en_US.UTF-8",
    TERM: "dumb",
  };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (/^[A-Z_][A-Z0-9_]*$/.test(k) && !k.startsWith("npm_config") && k !== "PATH" && k !== "HOME") base[k] = v;
  }
  return base;
}

function spawnSandboxed(projectId: string, command: string, env: Record<string, string>): ChildProcess {
  const cwd = projectDir(projectId);
  fs.mkdirSync(cwd, { recursive: true });
  // ulimit: CPU seconds per process, file size, open files
  const wrapped = `ulimit -t 900 -f 2000000 -n 2048; ${command}`;
  if (hasSeatbelt()) {
    return spawn(SANDBOX_EXEC, ["-p", seatbeltProfile(projectId), "/bin/sh", "-c", wrapped], { cwd, env: env as NodeJS.ProcessEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  }
  return spawn("/bin/sh", ["-c", wrapped], { cwd, env: env as NodeJS.ProcessEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* gone */
    }
  }, 3000).unref();
}

export class LocalSandbox implements SandboxProvider {
  readonly name = "local";

  describe(): string {
    return hasSeatbelt()
      ? "macOS Seatbelt (sandbox-exec): filesystem confined to the project, scrubbed environment, CPU/file limits"
      : "Process isolation only (scrubbed environment, confined working directory). Install Docker for full isolation.";
  }

  async exec(projectId: string, command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const started = Date.now();
    const timeoutMs = Math.min(opts.timeoutMs ?? 120_000, 600_000);
    const max = opts.maxOutputBytes ?? 200_000;
    const child = spawnSandboxed(projectId, command, scrubbedEnv(projectId, opts.env));
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = (cur: string, chunk: string) => (cur.length >= max ? cur : (cur + chunk).slice(0, max));
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stdout = cap(stdout, s);
      opts.onOutput?.(s, "stdout");
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stderr = cap(stderr, s);
      opts.onOutput?.(s, "stderr");
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const onAbort = () => killTree(child);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    return { exitCode, stdout, stderr, timedOut, durationMs: Date.now() - started };
  }

  async startService(projectId: string, command: string, opts: ServiceOptions): Promise<ServiceHandle> {
    const env = scrubbedEnv(projectId, { ...(opts.env ?? {}), PORT: String(opts.port) });
    const child = spawnSandboxed(projectId, command, env);
    child.stdout?.on("data", (d: Buffer) => opts.onOutput?.(d.toString("utf8"), "stdout"));
    child.stderr?.on("data", (d: Buffer) => opts.onOutput?.(d.toString("utf8"), "stderr"));
    const exited = new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
    return {
      pid: child.pid,
      exited,
      stop: async () => {
        killTree(child);
        await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]);
      },
    };
  }
}
