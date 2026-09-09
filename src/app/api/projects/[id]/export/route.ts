import { spawn } from "node:child_process";
import { projectRoute } from "@/lib/api/project-route";
import { HttpError } from "@/lib/http";
import { materialize } from "@/lib/projects/files";
import { projectDir } from "@/lib/paths";

/** Downloads the project's source as a zip (without node_modules/build output). */
export const GET = projectRoute(async (_req, { project }) => {
  await materialize(project.id);
  const dir = projectDir(project.id);
  const zip = spawn("zip", ["-r", "-q", "-", ".", "-x", "node_modules/*", "dist/*", ".next/*", "out/*", ".vite/*", "*.tsbuildinfo"], { cwd: dir });
  const chunks: Buffer[] = [];
  zip.stdout.on("data", (d: Buffer) => chunks.push(d));
  const code = await new Promise<number | null>((resolve) => {
    zip.on("error", () => resolve(null));
    zip.on("close", (c) => resolve(c));
  });
  if (code !== 0) throw new HttpError(500, "Couldn't create the download.");
  const name = `${project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "project"}.zip`;
  return new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` } });
});
