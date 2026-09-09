"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Spinner } from "../ui";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-muted"><Spinner /></div> });

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", css: "css", html: "html", json: "json", md: "markdown", svg: "xml", xml: "xml", yml: "yaml", yaml: "yaml", sh: "shell" } as Record<string, string>)[ext ?? ""] ?? "plaintext";
}

type Props = { projectId: string; path: string | null; onSaved: () => void; onConflict: (resolve: { keepMine: () => Promise<void>; useLatest: () => Promise<void>; askAI: () => void }) => void; refreshKey: number; onAskAI: (text: string) => void };

/** Monaco editor bound to a project file. Saves automatically (debounced) and on Cmd/Ctrl+S. */
export function CodeEditor({ projectId, path, onSaved, onConflict, refreshKey, onAskAI }: Props) {
  const [loaded, setLoaded] = useState<{ path: string; content: string; hash: string } | null>(null);
  const content = loaded && loaded.path === path ? loaded.content : null;
  const hash = loaded && loaded.path === path ? loaded.hash : "";
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ content: "", hash: "", path: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const r = await api<{ file: { content: string; hash: string } }>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
      latest.current = { content: r.file.content, hash: r.file.hash, path };
      setLoaded({ path, content: r.file.content, hash: r.file.hash });
      setDirty(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId, path]);

  useEffect(() => {
    // load() only calls setState after awaiting the network.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  // When the AI changes files, reload the open one if we have no unsaved edits.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dirty) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const save = useCallback(
    async (force = false) => {
      const { content: c, hash: h, path: p } = latest.current;
      if (!p) return;
      setSaving(true);
      setError(null);
      try {
        const r = await api<{ file: { hash: string } }>(`/api/projects/${projectId}/files`, { method: "POST", json: { path: p, content: c, expectedHash: h, force } });
        latest.current.hash = r.file.hash;
        setLoaded((l) => (l && l.path === p ? { ...l, hash: r.file.hash, content: c } : l));
        setDirty(false);
        onSaved();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          onConflict({
            keepMine: () => saveRef.current(true),
            useLatest: load,
            askAI: async () => {
              const server = await api<{ file: { content: string } }>(`/api/projects/${projectId}/files?path=${encodeURIComponent(p)}`);
              onAskAI(`I edited ${p} manually but it also changed elsewhere. Please merge both versions sensibly and keep the file working.\n\nMy version:\n\`\`\`\n${c.slice(0, 6000)}\n\`\`\`\n\nOther version:\n\`\`\`\n${server.file.content.slice(0, 6000)}\n\`\`\``);
              await load();
            },
          });
        } else setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [projectId, onSaved, onConflict, load, onAskAI],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  function onChange(v: string | undefined) {
    if (v === undefined) return;
    latest.current.content = v;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(), 1200);
  }

  if (!path) return <div className="grid h-full place-items-center text-sm text-muted">Select a file to edit</div>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3 text-xs text-muted">
        <span className="truncate font-mono">{path}</span>
        <span>{error ? <span className="text-red-600">{error}</span> : saving ? "Saving..." : dirty ? "Unsaved" : "Saved"}</span>
      </div>
      <div className="min-h-0 flex-1">
        {content === null ? (
          <div className="grid h-full place-items-center text-muted">{error ? null : <Spinner />}</div>
        ) : (
          <Monaco
            key={`${path}:${hash}`}
            height="100%"
            language={languageFor(path)}
            defaultValue={content}
            onChange={onChange}
            theme="vs-dark"
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                if (timer.current) clearTimeout(timer.current);
                save();
              });
            }}
            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, padding: { top: 8 } }}
          />
        )}
      </div>
    </div>
  );
}
