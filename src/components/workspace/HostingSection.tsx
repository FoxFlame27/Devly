"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { api } from "@/lib/client/api";
import type { useHosting, DomainStatus } from "@/lib/client/useHosting";
import { Button, ErrorText, Field, inputClass } from "../ui";

type Hosting = ReturnType<typeof useHosting>;

/** Settings card: connect Vercel, deploy, and set up a custom domain with the exact DNS records. */
export function HostingSection({ projectId, hosting }: { projectId: string; hosting: Hosting }) {
  const [account, setAccount] = useState<{ connected: boolean; username?: string; invalid?: boolean } | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [checking, setChecking] = useState(false);

  async function loadAccount() {
    const a = await api<{ connected: boolean; username?: string; invalid?: boolean }>("/api/vercel/token").catch(() => ({ connected: false }));
    setAccount(a);
  }
  useEffect(() => {
    const t = setTimeout(() => void loadAccount(), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!hosting.info?.customDomain) return;
    const t = setTimeout(() => {
      api<{ status: DomainStatus }>(`/api/projects/${projectId}/domain`).then((r) => setStatus(r.status)).catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [hosting.info?.customDomain, projectId]);

  async function saveToken() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/vercel/token", { method: "PUT", json: { token: token.trim() } });
      setToken("");
      await loadAccount();
      await hosting.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeToken() {
    await api("/api/vercel/token", { method: "DELETE" });
    await loadAccount();
    await hosting.refresh();
  }
  async function addDomain() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ status: DomainStatus }>(`/api/projects/${projectId}/domain`, { method: "POST", json: { domain } });
      setStatus(r.status);
      setDomain("");
      await hosting.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setChecking(true);
    try {
      const r = await api<{ status: DomainStatus }>(`/api/projects/${projectId}/domain`);
      setStatus(r.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  async function removeDomain() {
    if (!window.confirm("Remove the custom domain from this site?")) return;
    await api(`/api/projects/${projectId}/domain`, { method: "DELETE" });
    setStatus(null);
    await hosting.refresh();
  }

  const info = hosting.info;
  return (
    <div className="space-y-4">
      {!account ? (
        <p className="text-xs text-muted">Checking hosting...</p>
      ) : !account.connected ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Host this project on your own Vercel account (free). Create a token at{" "}
            <a className="underline" href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">
              vercel.com/account/tokens
            </a>{" "}
            and paste it here. It is stored encrypted and works for all your projects.
          </p>
          {account.invalid ? <p className="text-xs text-red-600">Your saved token no longer works. Add a new one.</p> : null}
          <div className="flex gap-2">
            <input className={inputClass} placeholder="Vercel token" value={token} onChange={(e) => setToken(e.target.value)} />
            <Button size="sm" variant="primary" onClick={saveToken} loading={busy} disabled={token.trim().length < 20}>
              Save
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Globe size={16} /> Vercel account <span className="font-medium">{account.username}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={removeToken}>
              Remove token
            </Button>
          </div>
          <div className="space-y-2 rounded-xl border border-line p-3">
            {info?.url ? (
              <p className="text-sm">
                Live at{" "}
                <a className="inline-flex items-center gap-1 font-medium underline" href={info.url} target="_blank" rel="noreferrer">
                  {info.url.replace(/^https?:\/\//, "")} <ExternalLink size={12} />
                </a>
                {info.deployedAt ? <span className="ml-2 text-xs text-muted">deployed {new Date(info.deployedAt).toLocaleString()}</span> : null}
              </p>
            ) : (
              <p className="text-xs text-muted">Not deployed yet. Deploying builds the project on Vercel and gives it a public address.</p>
            )}
            <Button size="sm" variant="primary" loading={!!hosting.deploying} disabled={!!hosting.deploying} onClick={() => hosting.deploy()}>
              {hosting.deploying ?? (info?.url ? "Deploy again" : "Deploy")}
            </Button>
            {hosting.message ? (
              <div className={`text-xs ${hosting.message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>
                {hosting.message.text}
                {hosting.message.logs ? <pre className="mt-1 max-h-40 overflow-auto rounded bg-code-bg p-2 text-[11px] text-code-ink">{hosting.message.logs}</pre> : null}
              </div>
            ) : null}
          </div>

          {info?.url ? (
            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="text-sm font-medium">Your own domain</p>
              {info.customDomain ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{info.customDomain}</span>{" "}
                    {status ? <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${status.configured && status.verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{status.configured && status.verified ? "working" : "waiting for DNS"}</span> : null}
                  </p>
                  {status ? (
                    <>
                      <p className="text-xs text-muted">{status.note}</p>
                      <p className="text-xs text-muted">Add these records where you bought the domain (DNS settings):</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="py-1 pr-2 font-medium">Type</th>
                            <th className="py-1 pr-2 font-medium">Name</th>
                            <th className="py-1 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.records.map((r, i) => (
                            <tr key={i} className="border-t border-line">
                              <td className="py-1 pr-2 font-mono">{r.type}</td>
                              <td className="py-1 pr-2 font-mono">{r.name}</td>
                              <td className="py-1 font-mono break-all">{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={check} loading={checking}>
                      Check again
                    </Button>
                    <Button size="sm" variant="ghost" onClick={removeDomain}>
                      Remove domain
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Field label="Domain">
                      <input className={inputClass} placeholder="mysite.com or app.mysite.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
                    </Field>
                  </div>
                  <div className="self-end">
                    <Button size="sm" variant="primary" onClick={addDomain} loading={busy} disabled={!domain.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
              <ErrorText>{error}</ErrorText>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
