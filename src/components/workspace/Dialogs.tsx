"use client";
import { useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/client/api";
import type { SnapshotSummary } from "@/lib/client/types";
import { Button, ErrorText, inputClass, Modal, Spinner } from "../ui";

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
