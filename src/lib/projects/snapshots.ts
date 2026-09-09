import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { db } from "../db";
import { sha256 } from "../crypto";
import { replaceAllFiles, snapshotFiles } from "./files";
import { HttpError } from "../http";

const MAX_SNAPSHOTS = 100;

export async function createSnapshot(projectId: string, label: string, trigger: string): Promise<{ id: string; created: boolean }> {
  const files = await snapshotFiles(projectId);
  const json = JSON.stringify({ files });
  const fingerprint = sha256(json);
  const last = await db.snapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, data: true } });
  if (last) {
    try {
      const lastJson = gunzipSync(Buffer.from(last.data)).toString("utf8");
      if (sha256(lastJson) === fingerprint) return { id: last.id, created: false };
    } catch {
      /* fallthrough */
    }
  }
  const snap = await db.snapshot.create({
    data: { projectId, label: label.slice(0, 120), trigger, data: gzipSync(Buffer.from(json, "utf8")), fileCount: Object.keys(files).length },
    select: { id: true },
  });
  const extra = await db.snapshot.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, skip: MAX_SNAPSHOTS, select: { id: true } });
  if (extra.length) await db.snapshot.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return { id: snap.id, created: true };
}

export async function listSnapshots(projectId: string) {
  return db.snapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, trigger: true, fileCount: true, createdAt: true },
    take: MAX_SNAPSHOTS,
  });
}

export async function restoreSnapshot(projectId: string, snapshotId: string) {
  const snap = await db.snapshot.findFirst({ where: { id: snapshotId, projectId } });
  if (!snap) throw new HttpError(404, "That version no longer exists.");
  await createSnapshot(projectId, "Before restore", "restore");
  const parsed = JSON.parse(gunzipSync(Buffer.from(snap.data)).toString("utf8")) as { files: Record<string, string> };
  await replaceAllFiles(projectId, parsed.files);
  return { fileCount: Object.keys(parsed.files).length };
}
