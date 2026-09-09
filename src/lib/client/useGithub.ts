"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export type GithubStatus = { repo: string | null; branch: string; lastSha: string | null; syncedAt: string | null; url: string | null };

/** Per-project GitHub state: connected repo, push and pull actions. */
export function useGithub(projectId: string) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [tokenConnected, setTokenConnected] = useState(false);
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ github: GithubStatus; tokenConnected: boolean }>(`/api/projects/${projectId}/github`);
      setStatus(r.github);
      setTokenConnected(r.tokenConnected);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const push = useCallback(
    async (commitMessage?: string) => {
      setBusy("push");
      setMessage(null);
      try {
        const r = await api<{ sha: string; url: string; files: number }>(`/api/projects/${projectId}/github/push`, { method: "POST", json: { message: commitMessage } });
        setMessage({ kind: "ok", text: `Pushed ${r.files} files (${r.sha.slice(0, 7)}).` });
        await refresh();
        return true;
      } catch (e) {
        setMessage({ kind: "error", text: (e as Error).message });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [projectId, refresh],
  );

  const pull = useCallback(async () => {
    setBusy("pull");
    setMessage(null);
    try {
      const r = await api<{ created: number; changed: number; deleted: number; skipped: string[] }>(`/api/projects/${projectId}/github/pull`, { method: "POST", json: {} });
      setMessage({ kind: "ok", text: `Pulled: ${r.created} new, ${r.changed} changed, ${r.deleted} removed${r.skipped.length ? `, ${r.skipped.length} skipped (binary/large)` : ""}.` });
      await refresh();
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }, [projectId, refresh]);

  return { status, tokenConnected, busy, message, setMessage, refresh, push, pull };
}
