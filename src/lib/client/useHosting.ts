"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { streamSse } from "./sse";

export type HostingInfo = { url: string | null; name: string | null; deployedAt: string | null; customDomain: string | null };
export type DomainStatus = { domain: string; verified: boolean; configured: boolean; records: { type: string; name: string; value: string }[]; note?: string };

/** Per-project hosting: deploy to the user's Vercel account, custom domain status. */
export function useHosting(projectId: string) {
  const [info, setInfo] = useState<HostingInfo | null>(null);
  const [tokenConnected, setTokenConnected] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; logs?: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ hosting: HostingInfo; tokenConnected: boolean }>(`/api/projects/${projectId}/deploy`);
      setInfo(r.hosting);
      setTokenConnected(r.tokenConnected);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const deploy = useCallback(async () => {
    setDeploying("Starting...");
    setMessage(null);
    try {
      let url: string | null = null;
      await streamSse<{ type: "status"; text: string } | { type: "done"; url: string } | { type: "error"; message: string; logs?: string }>(`/api/projects/${projectId}/deploy`, {}, (e) => {
        if (e.type === "status") setDeploying(e.text);
        else if (e.type === "done") url = e.url;
        else if (e.type === "error") setMessage({ kind: "error", text: e.message, logs: e.logs });
      });
      if (url) setMessage({ kind: "ok", text: `Live at ${url}` });
      await refresh();
      return url;
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      return null;
    } finally {
      setDeploying(null);
    }
  }, [projectId, refresh]);

  return { info, tokenConnected, deploying, message, setMessage, refresh, deploy };
}
