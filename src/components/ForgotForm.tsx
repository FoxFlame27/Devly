"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { friendlyOtpError, getSupabase, supabaseConfigured } from "@/lib/client/supabase";
import { Button, ErrorText, Field, inputClass, Spinner } from "./ui";
import { setNavLoading } from "./NavProgress";
import { CheckCircle2 } from "lucide-react";

type Verify = { provider?: "supabase"; challengeId?: string; email: string; masked?: string; devCode?: string };
const RESEND_COOLDOWN = 15;

/** Forgot password: email -> code -> new password. Uses the same code delivery as signup. */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(to: string) {
    const r = await api<{ verify: Verify }>("/api/auth/forgot", { method: "POST", json: { email: to } });
    if (r.verify.provider === "supabase") {
      if (!supabaseConfigured()) throw new Error("Email verification isn't configured.");
      const { error: e } = await getSupabase().auth.signInWithOtp({ email: to, options: { shouldCreateUser: true } });
      if (e) throw new Error(friendlyOtpError(e.message));
    }
    setVerify(r.verify);
    setCooldown(RESEND_COOLDOWN);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendCode(email.trim().toLowerCase());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!verify) return;
    setBusy(true);
    setError(null);
    try {
      if (verify.provider === "supabase") {
        const { data, error: e2 } = await getSupabase().auth.verifyOtp({ email: verify.email, token: code, type: "email" });
        if (e2 || !data.session) throw new Error(friendlyOtpError(e2?.message ?? "No session"));
        await api("/api/auth/reset-password", { method: "POST", json: { accessToken: data.session.access_token, password } });
        await getSupabase().auth.signOut().catch(() => {});
      } else {
        await api("/api/auth/reset-password", { method: "POST", json: { challengeId: verify.challengeId, code, password } });
      }
      setDone(true);
      setNavLoading(true);
      router.push("/projects");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      if ((err as { code?: string }).code === "challenge_expired") setVerify(null);
      setBusy(false);
    }
  }

  async function resend() {
    if (!verify || cooldown > 0) return;
    setInfo(null);
    setError(null);
    try {
      await sendCode(verify.email);
      setInfo("A new code is on its way.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/devly-logo.png" alt="Devly" className="mb-8 h-20 w-auto rounded-2xl bg-[#1f1e1b] px-6 py-2" />
      {done ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center">
          <CheckCircle2 className="text-green-600" size={36} />
          <p className="text-base font-medium">Password changed. Logging you in...</p>
          <Spinner className="size-4" />
        </div>
      ) : verify ? (
        <form onSubmit={submitReset} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Set a new password</h1>
          <p className="text-sm text-muted">
            We sent a 6-digit code to <span className="text-ink">{verify.masked ?? verify.email}</span>. Enter it and choose a new password.
          </p>
          {verify.devCode ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Local testing code: <span className="font-mono text-sm font-semibold">{verify.devCode}</span>
            </p>
          ) : null}
          <Field label="Code">
            <input className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorText>{error}</ErrorText>
          {info ? <p className="text-xs text-muted">{info}</p> : null}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={code.length !== 6 || password.length < 8}>
            Change password
          </Button>
          <div className="flex justify-between text-sm text-muted">
            <button type="button" onClick={resend} disabled={cooldown > 0} className="hover:text-ink disabled:cursor-default disabled:opacity-60">
              {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
            </button>
            <button type="button" onClick={() => setVerify(null)} className="hover:text-ink">
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitEmail} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted">Enter your email and we&apos;ll send you a code to set a new one.</p>
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Send code
          </Button>
          <p className="text-center text-sm text-muted">
            <Link className="text-ink underline" href="/login">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
