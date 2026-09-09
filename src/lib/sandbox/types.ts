export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

export type ExecOptions = {
  /** Wall-clock limit in ms */
  timeoutMs?: number;
  /** Project-level environment variables (already decrypted) */
  env?: Record<string, string>;
  /** Max bytes captured for stdout/stderr each */
  maxOutputBytes?: number;
  signal?: AbortSignal;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
};

export type ServiceHandle = {
  /** Stops the service and its whole process group */
  stop: () => Promise<void>;
  /** Resolves when the process exits */
  exited: Promise<number | null>;
  pid: number | undefined;
};

export type ServiceOptions = {
  port: number;
  env?: Record<string, string>;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
};

export interface SandboxProvider {
  readonly name: string;
  /** Human-readable description of the isolation in effect (shown in admin system status) */
  describe(): string;
  /** Runs a shell command inside the project's isolated environment and waits for it. */
  exec(projectId: string, command: string, opts?: ExecOptions): Promise<ExecResult>;
  /** Starts a long-running service (dev server) bound to the given port. */
  startService(projectId: string, command: string, opts: ServiceOptions): Promise<ServiceHandle>;
}
