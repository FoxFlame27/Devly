"use client";
import { useCallback, useEffect, useState } from "react";
import { api, timeAgo } from "@/lib/client/api";
import { Button, ErrorText, inputClass } from "../ui";

type Tab = "users" | "projects" | "usage" | "codes" | "status";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Admin</h1>
      <div className="mb-4 flex gap-1 border-b border-line">
        {(["users", "projects", "usage", "codes", "status"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t === "codes" ? "Access codes" : t}
          </button>
        ))}
      </div>
      {tab === "users" ? <Users /> : tab === "projects" ? <Projects /> : tab === "usage" ? <Usage /> : tab === "codes" ? <Codes /> : <Status />}
    </div>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => api<T>(path).then(setData).catch((e) => setError((e as Error).message)), [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "px-3 py-2 text-sm";

type U = { id: string; email: string; name: string | null; role: "USER" | "ADMIN"; promptsUsed: number; promptLimit: number; unlimited: boolean; disabled: boolean; createdAt: string; _count: { projects: number; usages: number } };

function Users() {
  const [q, setQ] = useState("");
  const { data, error, reload } = useLoad<{ users: U[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  const [err, setErr] = useState<string | null>(null);
  async function patch(userId: string, patch: Record<string, unknown>) {
    setErr(null);
    try {
      await api("/api/admin/users", { method: "PATCH", json: { userId, ...patch } });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div>
      <input className={`${inputClass} mb-3 max-w-sm`} placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorText>{error ?? err}</ErrorText>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>User</th>
              <th className={th}>Role</th>
              <th className={th}>Prompts</th>
              <th className={th}>Projects</th>
              <th className={th}>Joined</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.users.map((u) => (
              <tr key={u.id} className={u.disabled ? "opacity-50" : ""}>
                <td className={td}>{u.email}</td>
                <td className={td}>{u.role}</td>
                <td className={td}>
                  {u.unlimited ? "Unlimited" : `${u.promptsUsed} / ${u.promptLimit}`}
                </td>
                <td className={td}>{u._count.projects}</td>
                <td className={td}>{timeAgo(u.createdAt)}</td>
                <td className={`${td} space-x-2 whitespace-nowrap`}>
                  <button className="text-xs underline" onClick={() => { const v = prompt("New prompt limit:", String(u.promptLimit)); if (v !== null && /^\d+$/.test(v)) patch(u.id, { promptLimit: Number(v) }); }}>Limit</button>
                  <button className="text-xs underline" onClick={() => patch(u.id, { promptsUsed: 0 })}>Reset used</button>
                  <button className="text-xs underline" onClick={() => patch(u.id, { unlimited: !u.unlimited })}>{u.unlimited ? "Limit" : "Unlimited"}</button>
                  <button className="text-xs underline" onClick={() => patch(u.id, { role: u.role === "ADMIN" ? "USER" : "ADMIN" })}>{u.role === "ADMIN" ? "Demote" : "Make admin"}</button>
                  <button className="text-xs text-red-600 underline" onClick={() => patch(u.id, { disabled: !u.disabled })}>{u.disabled ? "Enable" : "Disable"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type P = { id: string; name: string; template: string; updatedAt: string; publishedSlug: string | null; owner: { email: string }; _count: { files: number; conversations: number } };
function Projects() {
  const { data, error } = useLoad<{ projects: P[] }>("/api/admin/projects");
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <ErrorText>{error}</ErrorText>
      <table className="w-full">
        <thead className="border-b border-line">
          <tr><th className={th}>Project</th><th className={th}>Owner</th><th className={th}>Template</th><th className={th}>Files</th><th className={th}>Published</th><th className={th}>Edited</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data?.projects.map((p) => (
            <tr key={p.id}>
              <td className={td}><a className="underline" href={`/p/${p.id}`}>{p.name}</a></td>
              <td className={td}>{p.owner.email}</td>
              <td className={td}>{p.template}</td>
              <td className={td}>{p._count.files}</td>
              <td className={td}>{p.publishedSlug ? "Yes" : "—"}</td>
              <td className={td}>{timeAgo(p.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type UsageData = {
  totals: { _sum: { inputTokens: number | null; outputTokens: number | null }; _count: number };
  byModel: { model: string; _sum: { inputTokens: number | null; outputTokens: number | null }; _count: number }[];
  recent: { id: string; model: string; inputTokens: number; outputTokens: number; steps: number; durationMs: number; status: string; createdAt: string; user: { email: string }; project: { name: string } | null }[];
};
function Usage() {
  const { data, error } = useLoad<UsageData>("/api/admin/usage");
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Requests (30d)" value={data.totals._count} />
        <Stat label="Input tokens" value={data.totals._sum.inputTokens ?? 0} />
        <Stat label="Output tokens" value={data.totals._sum.outputTokens ?? 0} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Model</th><th className={th}>Requests</th><th className={th}>Input</th><th className={th}>Output</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.byModel.map((m) => (
              <tr key={m.model}><td className={td}>{m.model}</td><td className={td}>{m._count}</td><td className={td}>{m._sum.inputTokens ?? 0}</td><td className={td}>{m._sum.outputTokens ?? 0}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>User</th><th className={th}>Project</th><th className={th}>Model</th><th className={th}>Steps</th><th className={th}>Tokens</th><th className={th}>Time</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.recent.map((r) => (
              <tr key={r.id}>
                <td className={td}>{timeAgo(r.createdAt)}</td><td className={td}>{r.user.email}</td><td className={td}>{r.project?.name ?? "—"}</td><td className={td}>{r.model}</td>
                <td className={td}>{r.steps}</td><td className={td}>{r.inputTokens + r.outputTokens}</td><td className={td}>{Math.round(r.durationMs / 1000)}s</td><td className={td}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

type Code = { id: string; hint: string; label: string | null; type: "PROMPTS" | "UNLIMITED"; prompts: number; maxRedemptions: number | null; redemptionCount: number; expiresAt: string | null; disabled: boolean; createdAt: string; createdBy: { email: string } | null };
function Codes() {
  const { data, error, reload } = useLoad<{ codes: Code[] }>("/api/admin/access-codes");
  const [type, setType] = useState<"PROMPTS" | "UNLIMITED">("PROMPTS");
  const [prompts, setPrompts] = useState(25);
  const [max, setMax] = useState("1");
  const [expires, setExpires] = useState("");
  const [label, setLabel] = useState("");
  const [custom, setCustom] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api<{ code: string }>("/api/admin/access-codes", {
        method: "POST",
        json: { type, prompts, maxRedemptions: max ? Number(max) : null, expiresAt: expires ? new Date(expires).toISOString() : null, label: label || null, code: custom || undefined },
      });
      setCreated(r.code);
      setCustom("");
      reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }
  async function toggle(c: Code) {
    await api("/api/admin/access-codes", { method: "PATCH", json: { id: c.id, disabled: !c.disabled } });
    reload();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-6">
        <label className="text-xs">Type<select className={inputClass} value={type} onChange={(e) => setType(e.target.value as "PROMPTS" | "UNLIMITED")}><option value="PROMPTS">Add prompts</option><option value="UNLIMITED">Unlimited</option></select></label>
        <label className="text-xs">Prompts<input className={inputClass} type="number" min={1} value={prompts} disabled={type === "UNLIMITED"} onChange={(e) => setPrompts(Number(e.target.value))} /></label>
        <label className="text-xs">Max uses (blank = ∞)<input className={inputClass} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-xs">Expires<input className={inputClass} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <label className="text-xs">Label<input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="text-xs">Custom code (optional)<input className={inputClass} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="auto" /></label>
        <div className="sm:col-span-6 flex items-center gap-3">
          <Button type="submit" variant="primary">Create code</Button>
          {created ? <span className="text-sm">New code: <code className="rounded bg-stone-100 px-2 py-1 font-mono">{created}</code> (shown once)</span> : null}
        </div>
        <div className="sm:col-span-6"><ErrorText>{err ?? error}</ErrorText></div>
      </form>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Code</th><th className={th}>Label</th><th className={th}>Type</th><th className={th}>Uses</th><th className={th}>Expires</th><th className={th}>Status</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-line">
            {data?.codes.map((c) => (
              <tr key={c.id} className={c.disabled ? "opacity-50" : ""}>
                <td className={`${td} font-mono`}>••••{c.hint}</td>
                <td className={td}>{c.label ?? "—"}</td>
                <td className={td}>{c.type === "UNLIMITED" ? "Unlimited" : `+${c.prompts} prompts`}</td>
                <td className={td}>{c.redemptionCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}</td>
                <td className={td}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never"}</td>
                <td className={td}>{c.disabled ? "Disabled" : "Active"}</td>
                <td className={td}><button className="text-xs underline" onClick={() => toggle(c)}>{c.disabled ? "Enable" : "Disable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0"><span className="text-muted">{k}</span><span className="text-right">{v}</span></div>
  );
}

type StatusData = {
  status: {
    database: string;
    sandbox: { provider: string; description: string };
    ai: { provider: string; models: { id: string; label: string }[]; defaultModel: string };
    hosting: string;
    previews: { projectId: string; status: string; port: number | null; uptimeMs: number | null }[];
    activeRuns: number;
    counts: { users: number; projects: number; usages: number };
    system: { node: string; platform: string; uptimeSec: number; memoryMb: number; loadAvg: number[] };
  };
};
function Status() {
  const { data, error } = useLoad<StatusData>("/api/admin/status");
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return null;
  const s = data.status;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface p-4">
        <Row k="Database" v={s.database === "ok" ? "Connected" : "Error"} />
        <Row k="AI provider" v={`${s.ai.provider} · default ${s.ai.defaultModel}`} />
        <Row k="Models" v={s.ai.models.map((m) => m.id).join(", ")} />
        <Row k="Sandbox" v={s.sandbox.provider} />
        <Row k="Isolation" v={<span className="text-xs">{s.sandbox.description}</span>} />
        <Row k="Hosting" v={s.hosting} />
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <Row k="Users / Projects / Requests" v={`${s.counts.users} / ${s.counts.projects} / ${s.counts.usages}`} />
        <Row k="Active AI runs" v={s.activeRuns} />
        <Row k="Running previews" v={s.previews.filter((p) => p.status === "running").length} />
        <Row k="Node" v={`${s.system.node} on ${s.system.platform}`} />
        <Row k="Server uptime" v={`${Math.round(s.system.uptimeSec / 60)} min`} />
        <Row k="Memory" v={`${s.system.memoryMb} MB`} />
        <Row k="Load" v={s.system.loadAvg.join(" / ")} />
      </div>
    </div>
  );
}
