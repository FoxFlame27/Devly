import "server-only";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { npmCacheDir, projectDir } from "../paths";
import type { ExecOptions, ExecResult, SandboxProvider, ServiceHandle, ServiceOptions } from "./types";

const IMAGE = process.env.SANDBOX_DOCKER_IMAGE ?? "node:24-alpine";

export function dockerAvailable(): boolean {
  try {
    const r = spawnSync("docker", ["info"], { stdio: "ignore", timeout: 5000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function envArgs(env?: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(env ?? {})) if (/^[A-Z_][A-Z0-9_]*$/.test(k)) out.push("-e", `${k}=${v}`);
  return out;
}

function baseArgs(projectId: string, extra: string[] = []): string[] {
  const dir = projectDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  return [
    "run", "--rm", "-i",
    "--memory", "1g", "--memory-swap", "1g", "--cpus", "1", "--pids-limit", "256",
    "--read-only", "--tmpfs", "/tmp:rw,size=256m", "--tmpfs", "/home/node:rw,size=64m",
    "--security-opt", "no-new-privileges", "--cap-drop", "ALL",
    "-u", "1000:1000",
    "-v", `${dir}:/workspace`, "-v", `${npmCacheDir()}:/home/node/.npm`,
    "-w", "/workspace",
    "-e", "HOME=/home/node", "-e", "npm_config_cache=/home/node/.npm", "-e", "CI=1", "-e", "NO_COLOR=1",
    ...extra,
  ];
}

/** Docker-based sandbox. Each command runs in a fresh, resource-limited container with only the project mounted. */
export class DockerSandbox implements SandboxProvider {
  readonly name = "docker";
  describe(): string {
    return `Docker containers (${IMAGE}): 1 CPU, 1 GB RAM, 256 processes, read-only root, only the project mounted`;
  }

  async exec(projectId: string, command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const started = Date.now();
    const timeoutMs = Math.min(opts.timeoutMs ?? 120_000, 600_000);
    const max = opts.maxOutputBytes ?? 200_000;
    const args = [...baseArgs(projectId, envArgs(opts.env)), IMAGE, "sh", "-c", command];
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      if (stdout.length < max) stdout += s;
      opts.onOutput?.(s, "stdout");
    });
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      if (stderr.length < max) stderr += s;
      opts.onOutput?.(s, "stderr");
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    opts.signal?.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (c) => resolve(c));
    });
    clearTimeout(timer);
    return { exitCode, stdout: stdout.slice(0, max), stderr: stderr.slice(0, max), timedOut, durationMs: Date.now() - started };
  }

  async startService(projectId: string, command: string, opts: ServiceOptions): Promise<ServiceHandle> {
    const name = `bb-${projectId}-${opts.port}`;
    const args = [
      ...baseArgs(projectId, ["--name", name, "-p", `127.0.0.1:${opts.port}:${opts.port}`, ...envArgs({ ...(opts.env ?? {}), PORT: String(opts.port) })]),
      IMAGE, "sh", "-c", command,
    ];
    const child: ChildProcess = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", (d: Buffer) => opts.onOutput?.(d.toString(), "stdout"));
    child.stderr?.on("data", (d: Buffer) => opts.onOutput?.(d.toString(), "stderr"));
    const exited = new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (c) => resolve(c));
    });
    return {
      pid: child.pid,
      exited,
      stop: async () => {
        spawnSync("docker", ["rm", "-f", name], { stdio: "ignore", timeout: 10000 });
        child.kill("SIGTERM");
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      },
    };
  }
}
