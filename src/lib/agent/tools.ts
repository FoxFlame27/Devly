import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSandbox } from "../sandbox";
import { CommandNotAllowed, validateCommand, validatePackageName } from "../sandbox/commands";
import { projectDir } from "../paths";
import { buildTree, deleteFile, emptyChanges, listFiles, mergeChanges, readFile, searchFiles, syncFromDisk, writeFile, type FileChanges, type TreeNode } from "../projects/files";
import { collectPreviewErrors, ensureRunning, markInstalled, previewInfo, startPreview } from "../projects/preview";
import { projectEnv } from "../projects/env-vars";
import { HttpError } from "../http";

export type ToolContext = {
  projectId: string;
  template: string;
  signal: AbortSignal;
  changes: FileChanges;
  /** true after get_project_errors reported problems, so later edits read as "Fixing an issue..." */
  fixing: boolean;
  previewStatus?: (status: string, url: string | null) => void;
};

export type ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  label: (input: z.infer<S>, ctx: ToolContext) => string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<string>;
};

const MAX_TOOL_OUTPUT = 40_000;
const pathArg = z.string().min(1).max(512).describe("Path relative to the project root, e.g. src/App.tsx");

function clip(s: string, n = MAX_TOOL_OUTPUT) {
  return s.length > n ? `${s.slice(0, n)}\n...[truncated ${s.length - n} characters]` : s;
}

function treeText(nodes: TreeNode[], depth = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    if (out.length > 400) break;
    out.push(`${"  ".repeat(depth)}${n.name}${n.type === "dir" ? "/" : ""}`);
    if (n.children) treeText(n.children, depth + 1, out);
  }
  return out;
}

function def<S extends z.ZodTypeAny>(t: ToolDef<S>): ToolDef {
  return t as unknown as ToolDef;
}

export const TOOLS: ToolDef[] = [
  def({
    name: "get_project_structure",
    description: "Returns the project's file tree, the package.json contents and which template/framework it uses. Call this first to understand the project.",
    schema: z.object({}),
    label: () => "Looking at your project...",
    run: async (_i, ctx) => {
      const files = await listFiles(ctx.projectId);
      let pkg = "";
      try {
        pkg = fs.readFileSync(path.join(projectDir(ctx.projectId), "package.json"), "utf8");
      } catch {
        /* none */
      }
      const info = previewInfo(ctx.projectId);
      return clip(
        [
          `Template: ${ctx.template}`,
          `Preview: ${info.status}${info.url ? ` at ${info.url}` : ""}`,
          `Files (${files.length}):`,
          ...treeText(buildTree(files)),
          pkg ? `\npackage.json:\n${pkg}` : "",
        ].join("\n"),
      );
    },
  }),
  def({
    name: "list_files",
    description: "Lists files in the project (optionally under a directory).",
    schema: z.object({ directory: z.string().max(512).optional().describe("Directory to list, relative to project root. Omit for all files.") }),
    label: () => "Looking at your project...",
    run: async (i, ctx) => {
      const files = await listFiles(ctx.projectId);
      const dir = (i.directory ?? "").replace(/^\.?\/+|\/+$/g, "");
      const filtered = dir ? files.filter((f) => f.path.startsWith(dir + "/")) : files;
      if (!filtered.length) return dir ? `No files under ${dir}/` : "No files.";
      return clip(filtered.map((f) => `${f.path} (${f.size} bytes)`).join("\n"));
    },
  }),
  def({
    name: "read_file",
    description: "Reads a file from the project and returns its full contents.",
    schema: z.object({ path: pathArg }),
    label: (i) => `Reading ${i.path}`,
    run: async (i, ctx) => {
      const f = await readFile(ctx.projectId, i.path);
      return clip(f.content, 80_000);
    },
  }),
  def({
    name: "write_file",
    description: "Creates or completely overwrites a file with the given content. Use edit_file for small changes to existing files.",
    schema: z.object({ path: pathArg, content: z.string().max(1_000_000) }),
    label: (i, ctx) => (ctx.fixing ? "Fixing an issue..." : `Writing ${i.path}`),
    run: async (i, ctx) => {
      const r = await writeFile(ctx.projectId, i.path, i.content);
      mergeChanges(ctx.changes, { created: r.created ? [r.path] : [], changed: r.created ? [] : [r.path], deleted: [] });
      return `Wrote ${r.path} (${Buffer.byteLength(i.content)} bytes).`;
    },
  }),
  def({
    name: "edit_file",
    description: "Replaces an exact snippet of text in an existing file. old_text must appear exactly once (or set replace_all). Include enough surrounding lines to make it unique.",
    schema: z.object({
      path: pathArg,
      old_text: z.string().min(1).max(200_000),
      new_text: z.string().max(200_000),
      replace_all: z.boolean().optional(),
    }),
    label: (i, ctx) => (ctx.fixing ? "Fixing an issue..." : `Editing ${i.path}`),
    run: async (i, ctx) => {
      const f = await readFile(ctx.projectId, i.path);
      const count = f.content.split(i.old_text).length - 1;
      if (count === 0) return `Error: old_text was not found in ${f.path}. Read the file again and copy the text exactly.`;
      if (count > 1 && !i.replace_all) return `Error: old_text appears ${count} times in ${f.path}. Include more context to make it unique, or set replace_all.`;
      const next = i.replace_all ? f.content.split(i.old_text).join(i.new_text) : f.content.replace(i.old_text, () => i.new_text);
      await writeFile(ctx.projectId, f.path, next);
      mergeChanges(ctx.changes, { created: [], changed: [f.path], deleted: [] });
      return `Edited ${f.path} (${count} replacement${count === 1 ? "" : "s"}).`;
    },
  }),
  def({
    name: "delete_file",
    description: "Deletes a file or folder from the project.",
    schema: z.object({ path: pathArg }),
    label: (i) => `Removing ${i.path}`,
    run: async (i, ctx) => {
      const deleted = await deleteFile(ctx.projectId, i.path);
      mergeChanges(ctx.changes, { created: [], changed: [], deleted });
      return deleted.length ? `Deleted ${deleted.join(", ")}.` : "Nothing to delete.";
    },
  }),
  def({
    name: "search_files",
    description: "Searches all project files for a text string. Returns matching lines with file paths and line numbers.",
    schema: z.object({ query: z.string().min(1).max(200), case_sensitive: z.boolean().optional() }),
    label: () => "Looking at your project...",
    run: async (i, ctx) => {
      const r = await searchFiles(ctx.projectId, i.query, { caseSensitive: i.case_sensitive });
      if (!r.length) return `No matches for "${i.query}".`;
      return clip(r.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n"));
    },
  }),
  def({
    name: "run_command",
    description: "Runs a shell command inside the project's sandbox (e.g. `npx tsc --noEmit`, `npm run build`, `ls src`). Network tools, package managers other than npm, and anything outside the project are not available. Returns stdout, stderr and the exit code.",
    schema: z.object({ command: z.string().min(1).max(2000), timeout_seconds: z.number().int().min(1).max(300).optional() }),
    label: (i) => (/\b(tsc|build|test|lint|vitest)\b/.test(i.command) ? "Testing..." : "Running a command..."),
    run: async (i, ctx) => {
      let cmd: string;
      try {
        cmd = validateCommand(i.command);
      } catch (e) {
        return `Error: ${e instanceof CommandNotAllowed ? e.message : "Command rejected"}`;
      }
      const env = await projectEnv(ctx.projectId);
      const r = await getSandbox().exec(ctx.projectId, cmd, { timeoutMs: (i.timeout_seconds ?? 120) * 1000, env, signal: ctx.signal });
      mergeChanges(ctx.changes, await syncFromDisk(ctx.projectId));
      return clip(`exit code: ${r.exitCode}${r.timedOut ? " (timed out)" : ""}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    },
  }),
  def({
    name: "install_package",
    description: "Installs one or more npm packages into the project (adds them to package.json).",
    schema: z.object({ packages: z.array(z.string().min(1).max(214)).min(1).max(20), dev: z.boolean().optional().describe("Install as a devDependency") }),
    label: (i) => `Installing ${i.packages.join(", ")}...`,
    run: async (i, ctx) => {
      let names: string[];
      try {
        names = i.packages.map(validatePackageName);
      } catch (e) {
        return `Error: ${(e as Error).message}`;
      }
      const env = await projectEnv(ctx.projectId);
      const r = await getSandbox().exec(ctx.projectId, `npm install ${i.dev ? "-D " : ""}${names.map((n) => JSON.stringify(n)).join(" ")} --no-audit --no-fund`, {
        timeoutMs: 300_000,
        env,
        signal: ctx.signal,
      });
      mergeChanges(ctx.changes, await syncFromDisk(ctx.projectId));
      if (r.exitCode === 0) {
        markInstalled(ctx.projectId);
        return `Installed ${names.join(", ")}.`;
      }
      return clip(`Install failed (exit ${r.exitCode}).\n${r.stderr || r.stdout}`);
    },
  }),
  def({
    name: "get_project_errors",
    description: "Checks the project for problems: type errors (tsc), dev server errors and runtime errors seen in the preview. Call this after making changes and fix anything it reports.",
    schema: z.object({}),
    label: () => "Testing...",
    run: async (_i, ctx) => {
      const problems: string[] = [];
      const root = projectDir(ctx.projectId);
      if (fs.existsSync(path.join(root, "tsconfig.json")) && ctx.template !== "nextjs") {
        const env = await projectEnv(ctx.projectId);
        const r = await getSandbox().exec(ctx.projectId, "npx tsc --noEmit -p .", { timeoutMs: 120_000, env, signal: ctx.signal });
        if (r.exitCode !== 0) problems.push(`TypeScript errors:\n${clip(r.stdout || r.stderr, 8000)}`);
      }
      const prev = collectPreviewErrors(ctx.projectId);
      problems.push(...prev.problems);
      ctx.fixing = problems.length > 0;
      if (!problems.length) return `No problems found. Preview status: ${prev.status}.`;
      return clip(problems.join("\n\n"));
    },
  }),
  def({
    name: "start_preview",
    description: "Starts the live preview (dev server) if it is not already running, installing packages first when needed. Returns the preview status and any startup errors.",
    schema: z.object({}),
    label: () => "Starting the preview...",
    run: async (_i, ctx) => {
      const info = await ensureRunning(ctx.projectId);
      ctx.previewStatus?.(info.status, info.url);
      if (info.status === "running") return `Preview is running at ${info.url}.`;
      return `Preview status: ${info.status}. ${info.lastError ?? ""}`;
    },
  }),
  def({
    name: "restart_preview",
    description: "Restarts the live preview dev server. Use after changing config files (vite.config, tailwind, package.json) or when the preview looks stuck.",
    schema: z.object({}),
    label: () => "Restarting the preview...",
    run: async (_i, ctx) => {
      const info = await startPreview(ctx.projectId);
      ctx.previewStatus?.(info.status, info.url);
      if (info.status === "running") return `Preview restarted at ${info.url}.`;
      return `Preview status: ${info.status}. ${info.lastError ?? ""}`;
    },
  }),
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tool definitions in Claude API format (JSON schema generated from the zod schemas). */
export function apiToolDefinitions() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, input_schema: schema as { type: "object"; [k: string]: unknown } };
  });
}

/** Validates input and runs a tool. Never throws: failures are returned as error strings so the model can recover. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ ok: boolean; output: string }> {
  const tool = toolByName(name);
  if (!tool) return { ok: false, output: `Unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, output: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  try {
    const output = await tool.run(parsed.data, ctx);
    return { ok: !output.startsWith("Error:"), output };
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : e instanceof Error ? e.message : String(e);
    return { ok: false, output: `Error: ${msg}` };
  }
}

export { emptyChanges };
