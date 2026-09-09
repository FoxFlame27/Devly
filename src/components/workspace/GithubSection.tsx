"use client";
import { useEffect, useState } from "react";
import { ExternalLink, GitBranch } from "lucide-react";
import { api } from "@/lib/client/api";
import type { useGithub } from "@/lib/client/useGithub";
import { Button, ErrorText, Field, inputClass } from "../ui";

type Gh = ReturnType<typeof useGithub>;

/** Settings card: connect a GitHub token, pick or create a repository, push and pull. */
export function GithubSection({ projectId, gh, onFilesChanged }: { projectId: string; gh: Gh; onFilesChanged: () => void }) {
  const [account, setAccount] = useState<{ connected: boolean; login?: string; invalid?: boolean } | null>(null);
  const [token, setToken] = useState("");
  const [repos, setRepos] = useState<{ full_name: string; private: boolean }[] | null>(null);
  const [repo, setRepo] = useState("");
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");

  async function loadAccount() {
    const a = await api<{ connected: boolean; login?: string; invalid?: boolean }>("/api/github/token").catch(() => ({ connected: false }));
    setAccount(a);
    if (a.connected) api<{ repos: { full_name: string; private: boolean }[] }>("/api/github/repos").then((r) => setRepos(r.repos)).catch(() => setRepos([]));
  }
  useEffect(() => {
    loadAccount();
  }, []);

  async function saveToken() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/github/token", { method: "PUT", json: { token: token.trim() } });
      setToken("");
      await loadAccount();
      await gh.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeToken() {
    await api("/api/github/token", { method: "DELETE" });
    setRepos(null);
    await loadAccount();
    await gh.refresh();
  }
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const body = mode === "new" ? { create: { name: newName.trim(), private: true } } : { repo };
      await api(`/api/projects/${projectId}/github`, { method: "POST", json: body });
      await gh.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    await api(`/api/projects/${projectId}/github`, { method: "DELETE" });
    await gh.refresh();
  }

  const connected = gh.status?.repo;
  return (
    <div className="space-y-4">
      {!account ? (
        <p className="text-xs text-muted">Checking GitHub...</p>
      ) : !account.connected ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Paste a GitHub personal access token so Devly can push and pull for you. Create one at{" "}
            <a className="underline" href="https://github.com/settings/tokens/new?scopes=repo&description=Devly" target="_blank" rel="noreferrer">
              github.com/settings/tokens
            </a>{" "}
            with the <span className="font-mono">repo</span> scope. It is stored encrypted.
          </p>
          {account.invalid ? <p className="text-xs text-red-600">Your saved token no longer works. Add a new one.</p> : null}
          <div className="flex gap-2">
            <input className={inputClass} placeholder="ghp_..." value={token} onChange={(e) => setToken(e.target.value)} />
            <Button size="sm" variant="primary" onClick={saveToken} loading={busy} disabled={token.trim().length < 20}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <GitBranch size={16} /> Connected as <span className="font-medium">{account.login}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={removeToken}>
            Remove token
          </Button>
        </div>
      )}

      {account?.connected ? (
        connected ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <a className="flex items-center gap-1 font-medium underline" href={gh.status!.url!} target="_blank" rel="noreferrer">
                {gh.status!.repo} <ExternalLink size={12} />
              </a>
              <span className="text-xs text-muted">branch {gh.status!.branch}</span>
            </div>
            {gh.status!.syncedAt ? <p className="text-xs text-muted">Last synced {new Date(gh.status!.syncedAt).toLocaleString()}{gh.status!.lastSha ? ` (${gh.status!.lastSha.slice(0, 7)})` : ""}</p> : <p className="text-xs text-muted">Not pushed yet.</p>}
            <Field label="Commit message (optional)">
              <input className={inputClass} placeholder="What changed?" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={gh.busy === "push"} disabled={!!gh.busy} onClick={() => gh.push(commitMsg.trim() || undefined).then((ok) => ok && setCommitMsg(""))}>
                Push to GitHub
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={gh.busy === "pull"}
                disabled={!!gh.busy}
                onClick={() => {
                  if (window.confirm("Pull replaces this project's files with the repository's files. A version is saved first so you can go back. Continue?")) gh.pull().then((ok) => ok && onFilesChanged());
                }}
              >
                Pull from GitHub
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
            {gh.message ? <p className={`text-xs ${gh.message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{gh.message.text}</p> : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex gap-2 text-xs">
              <button className={`rounded-full px-3 py-1 ${mode === "existing" ? "bg-ink text-bg" : "bg-stone-100"}`} onClick={() => setMode("existing")}>
                Existing repository
              </button>
              <button className={`rounded-full px-3 py-1 ${mode === "new" ? "bg-ink text-bg" : "bg-stone-100"}`} onClick={() => setMode("new")}>
                Create new
              </button>
            </div>
            {mode === "existing" ? (
              <Field label="Repository">
                {repos === null ? (
                  <p className="text-xs text-muted">Loading your repositories...</p>
                ) : (
                  <select className={inputClass} value={repo} onChange={(e) => setRepo(e.target.value)}>
                    <option value="">Choose...</option>
                    {repos.map((r) => (
                      <option key={r.full_name} value={r.full_name}>
                        {r.full_name}
                        {r.private ? " (private)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <Field label="New repository name" hint="Created as private under your account">
                <input className={inputClass} placeholder="my-site" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
            )}
            <ErrorText>{error}</ErrorText>
            <Button size="sm" variant="primary" onClick={connect} loading={busy} disabled={mode === "existing" ? !repo : !newName.trim()}>
              Connect
            </Button>
          </div>
        )
      ) : null}
      <ErrorText>{account?.connected ? null : error}</ErrorText>
    </div>
  );
}
