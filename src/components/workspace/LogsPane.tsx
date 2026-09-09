"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PreviewInfo } from "@/lib/client/types";

export function LogsPane({ projectId, info }: { projectId: string; info: PreviewInfo }) {
  const [logs, setLogs] = useState<string[]>([]);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => api<{ logs: string[] }>(`/api/projects/${projectId}/preview/logs`).then((r) => alive && setLogs(r.logs)).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [projectId]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {info.lastError ? <pre className="max-h-40 shrink-0 overflow-auto border-b border-line bg-red-50 p-3 font-mono text-[11px] text-red-800">{info.lastError}</pre> : null}
      {info.runtimeErrors.length ? (
        <div className="shrink-0 border-b border-line bg-amber-50 p-3 font-mono text-[11px] text-amber-900">
          {info.runtimeErrors.map((e, i) => (
            <div key={i}>
              [{e.kind}] {e.message}
            </div>
          ))}
        </div>
      ) : null}
      <pre ref={ref} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap code-bg p-3 font-mono text-[12px] leading-relaxed scroll-thin">
        {logs.length ? logs.join("\n") : "No output yet."}
      </pre>
    </div>
  );
}
