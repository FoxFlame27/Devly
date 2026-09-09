import "server-only";
import { env } from "../env";
import { DockerSandbox, dockerAvailable } from "./docker";
import { LocalSandbox } from "./local";
import type { SandboxProvider } from "./types";

const g = globalThis as unknown as { __dockerOk?: boolean };

/** Returns the configured sandbox provider (Docker when available, otherwise local Seatbelt/process isolation). */
export function getSandbox(): SandboxProvider {
  const mode = env().SANDBOX_PROVIDER;
  if (mode === "docker") return new DockerSandbox();
  if (mode === "auto") {
    g.__dockerOk ??= dockerAvailable();
    if (g.__dockerOk) return new DockerSandbox();
  }
  return new LocalSandbox();
}

export type { SandboxProvider, ExecResult } from "./types";
