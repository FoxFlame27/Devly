"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "../ui";

const TABLES = [
  { id: "files", label: "Files" },
  { id: "conversations", label: "Conversations" },
  { id: "messages", label: "Messages" },
  { id: "versions", label: "Versions" },
  { id: "secrets", label: "Secret keys" },
  { id: "usage", label: "AI usage" },
];

type Data = { columns: string[]; rows: Record<string, unknown>[] };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Browse everything the platform stores for this project. Read-only. */
export function DataPane({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [table, setTable] = useState("files");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<Data>(`/api/projects/${projectId}/data?table=${table}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [projectId, table, refreshKey]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 text-xs">
        {TABLES.map((t) => (
          <button key={t.id} onClick={() => setTable(t.id)} className={`shrink-0 rounded-md px-2.5 py-1 ${table === t.id ? "bg-stone-200 text-ink" : "text-muted hover:bg-stone-100"}`}>
            {t.label}
          </button>
        ))}
        <span className="ml-auto shrink-0 pr-1 text-muted">{data ? `${data.rows.length} rows` : ""}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        {error ? <p className="p-3 text-sm text-red-600">{error}</p> : null}
        {!data ? (
          <div className="grid h-full place-items-center text-muted">
            <Spinner />
          </div>
        ) : data.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nothing here yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr>
                {data.columns.map((c) => (
                  <th key={c} className="border-b border-line px-3 py-2 font-medium text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r, i) => (
                <tr key={String(r.id ?? i)} className="hover:bg-stone-50">
                  {data.columns.map((c) => (
                    <td key={c} className="max-w-[360px] truncate px-3 py-1.5 font-mono" title={cell(r[c])}>
                      {cell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
