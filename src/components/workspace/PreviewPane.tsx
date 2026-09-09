"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PreviewInfo } from "@/lib/client/types";
import { Button, Spinner } from "../ui";

type Props = {
  projectId: string;
  info: PreviewInfo;
  reloadKey: number;
  onRefresh: () => void;
  onRestart: () => void;
  onPublish: () => void;
  onAskFix: (details: string) => void;
  publishing: boolean;
  advanced: boolean;
  aiBusy: boolean;
};

export function PreviewPane(p: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [runtimeErr, setRuntimeErr] = useState<{ text: string; key: string } | null>(null);
  const frameKey = `${p.info.url}:${p.reloadKey}`;
  const runtimeError = runtimeErr && runtimeErr.key === frameKey ? runtimeErr.text : null;
  const setRuntimeError = (text: string | null) => setRuntimeErr(text ? { text, key: frameKey } : null);
  const [showDetails, setShowDetails] = useState(false);

  // Errors inside the running project are posted by a tiny script in the template.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as { source?: string; kind?: string; message?: string; stack?: string };
      if (!d || d.source !== "buildbot-preview") return;
      if (d.kind === "clear" || d.kind === "ready") {
        if (d.kind === "clear") setRuntimeError(null);
      } else if (d.message) {
        setRuntimeError(`${d.message}${d.stack ? `\n${d.stack.split("\n").slice(1, 4).join("\n")}` : ""}`);
      }
      api(`/api/projects/${p.projectId}/preview/report`, { method: "POST", json: { kind: d.kind, message: d.message, stack: d.stack } }).catch(() => {});
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.projectId, frameKey]);

  const src = p.info.status === "running" && p.info.url ? `${p.info.url}/?v=${p.reloadKey}` : null;
  const failed = p.info.status === "error";
  const problem = failed ? p.info.lastError : runtimeError;
  const dot = { running: "bg-green-500", starting: "bg-amber-400 dot-pulse", installing: "bg-amber-400 dot-pulse", error: "bg-red-500", stopped: "bg-stone-300" }[p.info.status];
  const statusLabel = { running: "Live", starting: "Starting", installing: "Getting ready", error: "Problem", stopped: "Off" }[p.info.status];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={`size-2 rounded-full ${dot}`} />
          <span>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={p.onRefresh} disabled={!src} title="Reload the preview">
            Refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={() => src && window.open(p.info.url!, "_blank")} disabled={!src} title="Open in a new tab">
            Open
          </Button>
          <Button size="sm" variant="primary" onClick={p.onPublish} loading={p.publishing} disabled={p.aiBusy} title="Put your project online">
            Publish
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-surface">
        {src ? <iframe key={src} ref={frame} src={src} title="Live preview" className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" /> : null}
        {!src && !failed ? (
          <div className="absolute inset-0 grid place-items-center bg-bg">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner className="size-4" />
              <span>{p.info.status === "installing" ? "Getting your project ready..." : p.info.status === "starting" ? "Starting your project..." : "Starting..."}</span>
            </div>
          </div>
        ) : null}
        {problem ? (
          <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface/95 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{failed ? "Your project couldn't start." : "Something went wrong with your project."}</p>
                <p className="text-xs text-muted">Ask the AI and it will look at the error and fix it.</p>
              </div>
              <div className="flex gap-2">
                {failed ? (
                  <Button size="sm" variant="secondary" onClick={p.onRestart}>
                    Restart
                  </Button>
                ) : null}
                {p.advanced ? (
                  <Button size="sm" variant="ghost" onClick={() => setShowDetails((s) => !s)}>
                    {showDetails ? "Hide details" : "Details"}
                  </Button>
                ) : null}
                <Button size="sm" variant="primary" onClick={() => p.onAskFix(problem)} disabled={p.aiBusy}>
                  Ask AI to fix
                </Button>
              </div>
            </div>
            {p.advanced && showDetails ? <pre className="mt-3 max-h-40 overflow-auto rounded-lg code-bg p-3 text-[11px]">{problem}</pre> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
