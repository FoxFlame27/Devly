"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, timeAgo } from "@/lib/client/api";
import type { ProjectDetail, SnapshotSummary } from "@/lib/client/types";
import { Button, ErrorText, Field, inputClass, Modal, Spinner } from "../ui";

/* ---------- History ---------- */

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return now.getTime() - d.getTime() < 3 * 3600 * 1000 ? "Today" : "Earlier today";
  if (d.getTime() >= startOfToday - 86400 * 1000) return "Yesterday";
  if (d.getTime() >= startOfToday - 7 * 86400 * 1000) return "This week";
  return "Older";
}

export function HistoryModal(props: { projectId: string; open: boolean; onClose: () => void; onRestored: () => void }) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="History">
      {props.open ? <HistoryList {...props} /> : null}
    </Modal>
  );
}

function HistoryList({ projectId, onClose, onRestored }: { projectId: string; onClose: () => void; onRestored: () => void }) {
  const [items, setItems] = useState<SnapshotSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ snapshots: SnapshotSummary[] }>(`/api/projects/${projectId}/snapshots`).then((r) => setItems(r.snapshots)).catch((e) => setError((e as Error).message));
  }, [projectId]);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/snapshots/${id}/restore`, { method: "POST" });
      onRestored();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const groups: Record<string, SnapshotSummary[]> = {};
  for (const s of items ?? []) (groups[groupLabel(s.createdAt)] ??= []).push(s);

  return (
    <>
      <p className="mb-3 text-sm text-muted">Every change is saved automatically. Restore any earlier version.</p>
      <ErrorText>{error}</ErrorText>
      {!items ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5 text-muted" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No versions yet.</p>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto scroll-thin">
          {Object.entries(groups).map(([label, list]) => (
            <div key={label}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {list.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{s.label}</div>
                      <div className="text-xs text-muted">{timeAgo(s.createdAt)}</div>
                    </div>
                    {label === "Today" && i === 0 ? (
                      <span className="text-xs text-muted">Current</span>
                    ) : (
                      <Button size="sm" variant="secondary" loading={busy === s.id} onClick={() => restore(s.id)}>
                        Restore
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Publish ---------- */

export function PublishModal({ open, onClose, url, error, details, advanced, onAskFix }: { open: boolean; onClose: () => void; url: string | null; error: string | null; details?: string | null; advanced: boolean; onAskFix?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={url ? "Your project is live!" : "Publishing didn't work"}>
      {url ? (
        <>
          <p className="mb-3 text-sm text-muted">Anyone with this link can see your project. Publish again any time to update it.</p>
          <div className="flex items-center gap-2">
            <input readOnly className={inputClass} value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.open(url, "_blank")}>
              Open site
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{error ?? "Something went wrong."}</p>
          {advanced && details ? <pre className="mt-3 max-h-48 overflow-auto rounded-lg code-bg p-3 text-[11px]">{details}</pre> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {onAskFix ? (
              <Button variant="primary" onClick={onAskFix}>
                Ask AI to fix
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- Settings ---------- */

type EnvRow = { key: string; preview: string; updatedAt: string };

type SettingsProps = { project: ProjectDetail; open: boolean; onClose: () => void; onRename: (name: string) => void; advanced: boolean; onAdvanced: (v: boolean) => void; onSave: () => Promise<void>; onSync: () => Promise<void>; saveState: "saved" | "saving" | "unsaved" };

export function SettingsModal(props: SettingsProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Settings" width="max-w-lg">
      {props.open ? <SettingsBody {...props} /> : null}
    </Modal>
  );
}

function SettingsBody({ project, onClose, onRename, advanced, onAdvanced, onSave, onSync, saveState }: SettingsProps) {
  const [name, setName] = useState(project.name);
  const [vars, setVars] = useState<EnvRow[]>([]);
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api<{ variables: EnvRow[] }>(`/api/projects/${project.id}/env`).then((r) => setVars(r.variables)).catch(() => {});
  }, [project.id]);

  async function saveName() {
    const n = name.trim();
    if (!n || n === project.name) return;
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { name: n } });
      onRename(n);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addVar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ variables: EnvRow[] }>(`/api/projects/${project.id}/env`, { method: "PUT", json: { key: k.trim().toUpperCase(), value: v } });
      setVars(r.variables);
      setK("");
      setV("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeVar(key: string) {
    const r = await api<{ variables: EnvRow[] }>(`/api/projects/${project.id}/env`, { method: "DELETE", json: { key } });
    setVars(r.variables);
  }

  async function deleteProject() {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      router.push("/projects");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        <Field label="Project name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === "Enter" && saveName()} />
        </Field>

        <div>
          <div className="mb-1.5 text-[13px] font-medium">Saving</div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm text-muted">{saveState === "saved" ? "Everything is saved automatically." : saveState === "saving" ? "Saving..." : "Changes in progress."}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={onSave} title="Store a version now">Save</Button>
              <Button size="sm" variant="secondary" onClick={onSync} title="Make sure everything is up to date">Sync</Button>
            </span>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium">Advanced Mode</div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm text-muted">Show files, code editor, terminal and logs</span>
            <input type="checkbox" checked={advanced} onChange={(e) => onAdvanced(e.target.checked)} className="size-4 accent-ink" />
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium">Secret keys</div>
          <p className="mb-2 text-xs text-muted">Values your project needs, like API keys. They are encrypted and only given to this project.</p>
          {vars.length ? (
            <ul className="mb-2 divide-y divide-line rounded-xl border border-line">
              {vars.map((r) => (
                <li key={r.key} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{r.key}</span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {r.preview}
                    <button onClick={() => removeVar(r.key)} className="text-red-600 hover:underline">
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <form onSubmit={addVar} className="flex gap-2">
            <input className={`${inputClass} font-mono text-xs uppercase`} placeholder="NAME" value={k} onChange={(e) => setK(e.target.value)} />
            <input className={inputClass} placeholder="value" value={v} onChange={(e) => setV(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!k.trim() || !v}>
              Add
            </Button>
          </form>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex items-center justify-between border-t border-line pt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Delete this project forever?</span>
              <Button size="sm" variant="danger" loading={busy} onClick={deleteProject}>
                Yes, delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-600 hover:underline">
              Delete project
            </button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

/* ---------- Conflict ---------- */

export function ConflictModal({ open, onKeepMine, onUseLatest, onAskAI, onClose }: { open: boolean; onKeepMine: () => void; onUseLatest: () => void; onAskAI: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Your project changed somewhere else">
      <p className="text-sm text-muted">This file was changed while you were editing it (for example by the AI). What would you like to keep?</p>
      <div className="mt-4 grid gap-2">
        <Button variant="primary" onClick={onKeepMine}>
          Keep mine
        </Button>
        <Button variant="secondary" onClick={onUseLatest}>
          Use latest
        </Button>
        <Button variant="secondary" onClick={onAskAI}>
          Let AI fix it
        </Button>
      </div>
    </Modal>
  );
}
