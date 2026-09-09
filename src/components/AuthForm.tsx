"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { friendlyOtpError, getSupabase, signInWithGoogle, supabaseConfigured } from "@/lib/client/supabase";
import { Button, ErrorText, Field, inputClass, Spinner } from "./ui";
import { setNavLoading } from "./NavProgress";
import { CheckCircle2 } from "lucide-react";

type Verify = { provider?: "supabase"; challengeId?: string; email: string; masked?: string; devCode?: string; devReason?: string };

const RESEND_COOLDOWN = 15;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "google" ? "Google sign-in didn't complete. Please try again." : null));
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const googleAvailable = supabaseConfigured();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/projects";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function finish() {
    setDone(mode === "signup" ? "Account created. Opening your projects..." : "Logged in. Opening your projects...");
    setNavLoading(true);
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/devly-logo.png" alt="Devly" className="mb-8 h-20 w-auto rounded-2xl bg-[#1f1e1b] px-6 py-2" />
      {done ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
          <CheckCircle2 className="text-green-600" size={36} />
          <p className="text-base font-medium">{done}</p>
          <Spinner className="size-4" />
        </div>
      ) : verify ? (
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
          {mode === "login" ? (
            <p className="-mt-2 text-right text-xs">
              <Link className="text-muted hover:text-ink" href="/forgot">
                Forgot password?
              </Link>
            </p>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            {mode === "signup" ? "Sign up" : "Log in"}
          </Button>
          {googleAvailable ? (
            <>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                loading={googleBusy}
                onClick={async () => {
                  setGoogleBusy(true);
                  setError(null);
                  const { error: e } = await signInWithGoogle(next);
                  if (e) {
                    setError(e.message);
                    setGoogleBusy(false);
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6C12.3 13.3 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                  <path fill="#FBBC05" d="M10.4 28.8A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.8-4.8l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.8-13.6-9.2l-7.8 6C6.5 42.6 14.6 48 24 48z" />
                </svg>
                Continue with Google
              </Button>
            </>
          ) : null}
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
