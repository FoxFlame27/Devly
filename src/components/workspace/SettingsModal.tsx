"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { EffortChoice, EffortOption, ModelOption, ProjectDetail } from "@/lib/client/types";
import { Button, ErrorText, Field, inputClass, Modal } from "../ui";
import { THEMES_LABELS } from "../ThemePicker";

type Tab = "general" | "ai" | "secrets" | "publishing" | "advanced";
type EnvRow = { key: string; preview: string; updatedAt: string };

export type SettingsProps = {
  project: ProjectDetail;
  open: boolean;
  onClose: () => void;
  onProject: (patch: Partial<ProjectDetail>) => void;
  advanced: boolean;
  onAdvanced: (v: boolean) => void;
  onSave: () => Promise<void>;
  onSync: () => Promise<void>;
  saveState: "saved" | "saving" | "unsaved";
  models: ModelOption[];
  efforts: EffortOption[];
  model: string;
  effort: EffortChoice;
  onModel: (m: string) => void;
  onEffort: (e: EffortChoice) => void;
  onPublish: () => void;
};

export function SettingsModal(props: SettingsProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} width="max-w-2xl">
      {props.open ? <SettingsBody {...props} /> : null}
    </Modal>
  );
}

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "general", label: "General", hint: "Name and description" },
  { id: "ai", label: "AI", hint: "Model and effort" },
  { id: "secrets", label: "Secret keys", hint: "Keys your project needs" },
  { id: "publishing", label: "Publishing", hint: "Your live link" },
  { id: "advanced", label: "Advanced", hint: "Tools, export, delete" },
];

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-sm font-medium">{title}</div>
      {text ? <p className="mt-0.5 text-xs text-muted">{text}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, text }: { checked: boolean; onChange: (v: boolean) => void; label: string; text?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        {text ? <span className="block text-xs text-muted">{text}</span> : null}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-stone-300"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Choice<T extends string>({ name, options, value, onChange }: { name: string; options: { id: T; label: string; description?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      {options.map((o) => (
        <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 ${value === o.id ? "bg-stone-100" : "hover:bg-stone-50"}`}>
          <input type="radio" name={name} className="mt-1 accent-ink" checked={value === o.id} onChange={() => onChange(o.id)} />
          <span>
            <span className="block text-sm">{o.label}</span>
            {o.description ? <span className="block text-xs text-muted">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function SettingsBody(p: SettingsProps) {
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState(p.project.name);
  const [description, setDescription] = useState(p.project.description ?? "");
  const [vars, setVars] = useState<EnvRow[]>([]);
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api<{ variables: EnvRow[] }>(`/api/projects/${p.project.id}/env`).then((r) => setVars(r.variables)).catch(() => {});
  }, [p.project.id]);

  async function saveGeneral() {
    const n = name.trim();
    if (!n || (n === p.project.name && description === (p.project.description ?? ""))) return;
    try {
      await api(`/api/projects/${p.project.id}`, { method: "PATCH", json: { name: n, description } });
      p.onProject({ name: n, description });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveAI(patch: { model?: string; effort?: string }) {
    if (patch.model) p.onModel(patch.model);
    if (patch.effort) p.onEffort(patch.effort as EffortChoice);
    try {
      await api(`/api/projects/${p.project.id}`, { method: "PATCH", json: { settings: patch } });
      p.onProject({ settings: { ...(p.project.settings ?? {}), ...patch } });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addVar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ variables: EnvRow[] }>(`/api/projects/${p.project.id}/env`, { method: "PUT", json: { key: k.trim().toUpperCase(), value: v } });
      setVars(r.variables);
      setK("");
      setV("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function removeVar(key: string) {
    const r = await api<{ variables: EnvRow[] }>(`/api/projects/${p.project.id}/env`, { method: "DELETE", json: { key } });
    setVars(r.variables);
  }
  async function unpublish() {
    setBusy("unpublish");
    try {
      await api(`/api/projects/${p.project.id}/unpublish`, { method: "POST" });
      p.onProject({ publishedUrl: null, publishedAt: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function deleteProject() {
    setBusy("delete");
    try {
      await api(`/api/projects/${p.project.id}`, { method: "DELETE" });
      router.push("/projects");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  const goPublish = () => {
    p.onClose();
    p.onPublish();
  };

  return (
    <div className="flex min-h-[440px] flex-col sm:flex-row">
      <aside className="shrink-0 border-b border-line pb-3 sm:w-44 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
        <h2 className="mb-2 px-2 text-base font-semibold">Settings</h2>
        <nav className="flex gap-1 overflow-x-auto sm:flex-col">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-lg px-2.5 py-2 text-left ${tab === t.id ? "bg-stone-100 text-ink" : "text-muted hover:bg-stone-50 hover:text-ink"}`}>
              <span className="block text-sm">{t.label}</span>
              <span className="hidden text-[11px] text-muted sm:block">{t.hint}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 space-y-3 pt-3 sm:pl-4 sm:pt-0">
        {tab === "general" ? (
          <>
            <Section title="Project">
              <div className="space-y-3">
                <Field label="Name">
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveGeneral} />
                </Field>
                <Field label="What it is" hint="The AI reads this on every request. Keep it accurate as the project grows.">
                  <textarea className={`${inputClass} h-20 resize-none py-2`} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveGeneral} placeholder="A website for my Minecraft server with a leaderboard..." />
                </Field>
                <div className="text-xs text-muted">Type: {p.project.template === "react" ? "App (React)" : p.project.template === "nextjs" ? "Next.js" : "Website"}</div>
              </div>
            </Section>
            <Section title="Look" text="Light or dark for the Y5 app itself. Your project's own design is separate.">
              <div className="text-sm text-muted">{THEMES_LABELS}</div>
            </Section>
          </>
        ) : null}

        {tab === "ai" ? (
          <>
            <Section title="Model" text="Which AI builds this project. Saved with the project.">
              <Choice name="model" options={p.models} value={p.model} onChange={(m) => saveAI({ model: m })} />
            </Section>
            <Section title="Effort" text="How hard the AI thinks before it acts. Higher is slower but more careful.">
              <Choice name="effort" options={p.efforts} value={p.effort} onChange={(e) => saveAI({ effort: e })} />
            </Section>
          </>
        ) : null}

        {tab === "secrets" ? (
          <Section title="Secret keys" text="Keys your project needs, like a weather or payment API key. They're encrypted and only this project can read them. Use them in code as import.meta.env.VITE_NAME (website/app) or process.env.NEXT_PUBLIC_NAME (Next.js).">
            {vars.length ? (
              <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
                {vars.map((r) => (
                  <li key={r.key} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{r.key}</span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {r.preview}
                      <button onClick={() => removeVar(r.key)} className="text-red-600 hover:underline">
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">No keys yet.</p>
            )}
            <form onSubmit={addVar} className="flex gap-2">
              <input className={`${inputClass} font-mono text-xs uppercase`} placeholder="VITE_API_KEY" value={k} onChange={(e) => setK(e.target.value)} />
              <input className={inputClass} placeholder="value" value={v} onChange={(e) => setV(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!k.trim() || !v}>
                Add
              </Button>
            </form>
          </Section>
        ) : null}

        {tab === "publishing" ? (
          <Section title={p.project.publishedUrl ? "Your project is live" : "Not published yet"} text={p.project.publishedUrl ? "Anyone with the link can see it. Publish again to update it." : "Publishing builds your project and gives you a link you can share."}>
            {p.project.publishedUrl ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input readOnly className={inputClass} value={p.project.publishedUrl} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="secondary" onClick={() => navigator.clipboard.writeText(p.project.publishedUrl!).then(() => setCopied(true))}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => window.open(p.project.publishedUrl!, "_blank")}>
                    Open site
                  </Button>
                  <Button variant="secondary" onClick={goPublish}>
                    Publish update
                  </Button>
                  <Button variant="ghost" loading={busy === "unpublish"} onClick={unpublish}>
                    Take offline
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" onClick={goPublish}>
                Publish now
              </Button>
            )}
          </Section>
        ) : null}

        {tab === "advanced" ? (
          <>
            <Section title="Developer tools">
              <Toggle checked={p.advanced} onChange={p.onAdvanced} label="Advanced Mode" text="Adds Terminal and Logs tabs and shows technical error details. Files are always available." />
            </Section>
            <Section title="Saving" text={p.saveState === "saved" ? "Everything is saved automatically after every change." : p.saveState === "saving" ? "Saving..." : "Changes in progress."}>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={p.onSave}>
                  Save a version now
                </Button>
                <Button size="sm" variant="secondary" onClick={p.onSync}>
                  Sync files
                </Button>
                <a href={`/api/projects/${p.project.id}/export`} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-medium hover:bg-stone-50">
                  Download as ZIP
                </a>
              </div>
            </Section>
            <Section title="Danger zone">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Delete this project and its published site forever?</span>
                  <Button size="sm" variant="danger" loading={busy === "delete"} onClick={deleteProject}>
                    Yes, delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                  Delete project
                </Button>
              )}
            </Section>
          </>
        ) : null}

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end pt-1">
          <Button variant="primary" onClick={p.onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
