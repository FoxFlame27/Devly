"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { friendlyOtpError, getSupabase, supabaseConfigured } from "@/lib/client/supabase";
import { Button, ErrorText, Field, inputClass, Logo } from "./ui";

type Verify = { provider?: "supabase"; challengeId?: string; email: string; masked?: string; devCode?: string; devReason?: string };

const RESEND_COOLDOWN = 15;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/projects";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function finish() {
    router.push(next.startsWith("/") ? next : "/projects");
    router.refresh();
  }

  /** Asks Supabase to email a 6-digit code. */
  async function sendSupabaseCode(to: string) {
    if (!supabaseConfigured()) throw new Error("Email verification isn't configured.");
    const { error: e } = await getSupabase().auth.signInWithOtp({ email: to, options: { shouldCreateUser: true } });
    if (e) throw new Error(friendlyOtpError(e.message));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user?: unknown; verify?: Verify }>(`/api/auth/${mode}`, { method: "POST", json: { email, password } });
      if (r.verify?.provider === "supabase") {
        await sendSupabaseCode(r.verify.email);
        setVerify(r.verify);
        setCooldown(RESEND_COOLDOWN);
      } else if (r.verify) {
        setVerify(r.verify);
        setCooldown(RESEND_COOLDOWN);
      } else finish();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!verify) return;
    setBusy(true);
    setError(null);
    try {
      if (verify.provider === "supabase") {
        const { data, error: e2 } = await getSupabase().auth.verifyOtp({ email: verify.email, token: code, type: "email" });
        if (e2 || !data.session) throw new Error(friendlyOtpError(e2?.message ?? "No session"));
        await api(`/api/auth/supabase`, { method: "POST", json: { accessToken: data.session.access_token, ...(mode === "signup" ? { password } : {}) } });
        await getSupabase().auth.signOut().catch(() => {});
      } else {
        await api(`/api/auth/verify`, { method: "POST", json: { challengeId: verify.challengeId, code } });
      }
      finish();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      if ((err as { code?: string }).code === "challenge_expired") setVerify(null);
      setBusy(false);
    }
  }

  async function resend() {
    if (!verify || cooldown > 0) return;
    setInfo(null);
    setError(null);
    try {
      if (verify.provider === "supabase") await sendSupabaseCode(verify.email);
      else {
        const r = await api<{ verify: Verify }>(`/api/auth/resend`, { method: "POST", json: { challengeId: verify.challengeId } });
        setVerify(r.verify);
      }
      setCooldown(RESEND_COOLDOWN);
      setInfo("A new code is on its way.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const shownEmail = verify?.masked ?? verify?.email ?? "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      {verify ? (
        <form onSubmit={submitCode} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-sm text-muted">
            We sent a 6-digit code to <span className="text-ink">{shownEmail}</span>. Enter it to continue.
          </p>
          {verify.devCode ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Local testing: {verify.devReason ?? "the code email wasn't sent."} Your code is <span className="font-mono text-sm font-semibold">{verify.devCode}</span>. This never shows on the live site.
            </p>
          ) : null}
          <Field label="Code">
            <input className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          {info ? <p className="text-xs text-muted">{info}</p> : null}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
            Verify
          </Button>
          <div className="flex justify-between text-sm text-muted">
            <button type="button" onClick={resend} disabled={cooldown > 0} className="hover:text-ink disabled:cursor-default disabled:opacity-60">
              {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setVerify(null);
                setCode("");
                setError(null);
              }}
              className="hover:text-ink"
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
            <input className={inputClass} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            {mode === "signup" ? "Sign up" : "Log in"}
          </Button>
          <p className="text-center text-sm text-muted">
            {mode === "signup" ? (
              <>
                Already have an account? <Link className="text-ink underline" href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
              </>
            ) : (
              <>
                New here? <Link className="text-ink underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
              </>
            )}
          </p>
        </form>
      )}
    </div>
  );
}
