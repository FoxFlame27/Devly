"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PreviewInfo } from "@/lib/client/types";

const idle: PreviewInfo = { status: "stopped", url: null, port: null, lastError: null, runtimeErrors: [], version: 0, uptimeMs: null };

export function usePreview(projectId: string) {
  const [info, setInfo] = useState<PreviewInfo>(idle);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await api<{ preview: PreviewInfo }>(`/api/projects/${projectId}/preview`);
      if (mounted.current) setInfo(r.preview);
      return r.preview;
    } catch {
      return null;
    }
  }, [projectId]);

  const act = useCallback(
    async (action: "start" | "restart" | "stop") => {
      setBusy(true);
      if (action !== "stop") setInfo((i) => ({ ...i, status: i.status === "running" && action === "start" ? "running" : "starting", lastError: null }));
      try {
        const r = await api<{ preview: PreviewInfo }>(`/api/projects/${projectId}/preview`, { method: "POST", json: { action } });
        if (mounted.current) {
          setInfo(r.preview);
          setReloadKey((k) => k + 1);
        }
      } catch {
        await fetchStatus();
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [projectId, fetchStatus],
  );

  useEffect(() => {
    mounted.current = true;
    const t = setTimeout(() => act("start").catch(() => {}), 0);
    return () => {
      clearTimeout(t);
      mounted.current = false;
    };
  }, [act]);

  // Poll: quickly while changing, slowly when stable.
  useEffect(() => {
    const t = setInterval(fetchStatus, info.status === "running" || info.status === "stopped" ? 8000 : 2500);
    return () => clearInterval(t);
  }, [fetchStatus, info.status]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  return { info, setInfo, reloadKey, refresh, restart: () => act("restart"), start: () => act("start"), busy, fetchStatus };
}
