"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, ErrorText, Field, inputClass, Logo } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/projects";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { email, password } });
      router.push(next.startsWith("/") ? next : "/projects");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
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
    </div>
  );
}
