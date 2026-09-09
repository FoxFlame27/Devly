"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { TreeNode } from "@/lib/client/types";

type Props = { projectId: string; selected: string | null; onSelect: (path: string) => void; refreshKey: number; onChanged: () => void };

export function FileExplorer({ projectId, selected, onSelect, refreshKey, onChanged }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set(["src", "app"]));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ path: string; line: number; text: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ tree: TreeNode[] }>(`/api/projects/${projectId}/files`).then((r) => setTree(r.tree)).catch(() => {});
  }, [projectId]);
  useEffect(load, [load, refreshKey]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api<{ results: { path: string; line: number; text: string }[] }>(`/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`).then((r) => setResults(r.results)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query, projectId]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const newFile = (dir = "") => {
    const name = prompt(`New file name${dir ? ` in ${dir}/` : ""}:`);
    if (!name) return;
    const p = dir ? `${dir}/${name}` : name;
    run(() => api(`/api/projects/${projectId}/files`, { method: "POST", json: { path: p, content: "" } })).then(() => onSelect(p));
  };
  const newFolder = (dir = "") => {
    const name = prompt(`New folder name${dir ? ` in ${dir}/` : ""}:`);
    if (!name) return;
    run(() => api(`/api/projects/${projectId}/files`, { method: "PATCH", json: { action: "mkdir", path: dir ? `${dir}/${name}` : name } }));
  };
  const rename = (p: string) => {
    const to = prompt("Rename to:", p);
    if (!to || to === p) return;
    run(() => api(`/api/projects/${projectId}/files`, { method: "PATCH", json: { action: "rename", from: p, to } }));
  };
  const remove = (p: string) => {
    if (!confirm(`Delete ${p}?`)) return;
    run(() => api(`/api/projects/${projectId}/files`, { method: "DELETE", json: { path: p } }));
  };

  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const Node = ({ n, depth }: { n: TreeNode; depth: number }) => {
    const isOpen = open.has(n.path);
    const isSel = selected === n.path;
    return (
      <div>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 text-[13px] ${isSel ? "bg-stone-200" : "hover:bg-stone-100"}`}
          style={{ paddingLeft: 6 + depth * 12 }}
        >
          <button onClick={() => (n.type === "dir" ? toggle(n.path) : onSelect(n.path))} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
            <span className="w-3 text-center text-[10px] text-muted">{n.type === "dir" ? (isOpen ? "▾" : "▸") : ""}</span>
            <span className="truncate">{n.name}</span>
          </button>
          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            {n.type === "dir" ? (
              <>
                <IconBtn title="New file" onClick={() => newFile(n.path)}>+</IconBtn>
                <IconBtn title="New folder" onClick={() => newFolder(n.path)}>▣</IconBtn>
              </>
            ) : null}
            <IconBtn title="Rename" onClick={() => rename(n.path)}>✎</IconBtn>
            <IconBtn title="Delete" onClick={() => remove(n.path)}>✕</IconBtn>
          </span>
        </div>
        {n.type === "dir" && isOpen ? n.children?.map((c) => <Node key={c.path} n={c} depth={depth + 1} />) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-xs outline-none focus:border-stone-400" />
        <IconBtn title="New file" onClick={() => newFile()}>+</IconBtn>
        <IconBtn title="New folder" onClick={() => newFolder()}>▣</IconBtn>
      </div>
      {error ? <p className="px-2 py-1 text-xs text-red-600">{error}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-1 scroll-thin">
        {results ? (
          results.length === 0 ? (
            <p className="p-2 text-xs text-muted">No matches.</p>
          ) : (
            results.map((r, i) => (
              <button key={i} onClick={() => onSelect(r.path)} className="block w-full rounded-md px-2 py-1 text-left hover:bg-stone-100">
                <div className="truncate text-[12px]">{r.path}:{r.line}</div>
                <div className="truncate font-mono text-[11px] text-muted">{r.text}</div>
              </button>
            ))
          )
        ) : (
          tree.map((n) => <Node key={n.path} n={n} depth={0} />)
        )}
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid size-6 place-items-center rounded text-[11px] text-muted hover:bg-stone-200 hover:text-ink">
      {children}
    </button>
  );
}
