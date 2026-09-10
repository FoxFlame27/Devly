"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client/api";
import type { SafeUser } from "@/lib/client/types";
import { Button, ErrorText, Field, inputClass } from "./ui";

/** Account page: who you are, change password. */
export function AccountSettings({ user }: { user: SafeUser }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", json: { current, next } });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <h1 className="text-xl font-semibold">Account</h1>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-sm font-medium">{user.email}</p>
        {user.name ? <p className="text-sm text-muted">{user.name}</p> : null}
      </div>
      <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold">Change password</h2>
        <Field label="Current password">
          <input className={inputClass} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Repeat new password">
          <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        {done ? (
          <p className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={16} /> Password changed. Other devices have been signed out.
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={busy} disabled={!current || next.length < 8 || confirm.length < 8}>
          Change password
        </Button>
        <p className="text-xs text-muted">
          Signed up with Google and never set a password? Use{" "}
          <a className="underline" href="/forgot">
            Forgot password
          </a>{" "}
          on the login page to create one.
        </p>
      </form>
    </div>
  );
}
