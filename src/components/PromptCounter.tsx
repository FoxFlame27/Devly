"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { SafeUser } from "@/lib/client/types";
import { Button, ErrorText, inputClass, Modal } from "./ui";

export function promptsLabel(u: SafeUser) {
  if (u.unlimited) return "Unlimited prompts";
  return `${Math.max(0, u.promptLimit - u.promptsUsed)} / ${u.promptLimit} prompts`;
}

/** Shows remaining prompts and lets the user enter an access code. */
export function PromptCounter({ user, onUser, forceOpen, onClose }: { user: SafeUser; onUser: (u: SafeUser) => void; forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const remaining = user.unlimited ? null : Math.max(0, user.promptLimit - user.promptsUsed);
  const isOpen = open || !!forceOpen;
  const close = () => {
    setOpen(false);
    setError(null);
    setSuccess(null);
    onClose?.();
  };

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ result: { type: "UNLIMITED" | "PROMPTS"; prompts: number }; user: SafeUser }>("/api/access-codes/redeem", { method: "POST", json: { code } });
      onUser(r.user);
      setSuccess(r.result.type === "UNLIMITED" ? "Unlimited prompts unlocked." : `Added ${r.result.prompts} prompts.`);
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${remaining === 0 ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "border-line bg-surface text-muted hover:border-stone-400 hover:text-ink"}`}
        title="Prompts remaining. Click to enter an access code."
      >
        {promptsLabel(user)}
      </button>
      <Modal open={isOpen} onClose={close} title={remaining === 0 ? "You've used your free prompts" : "Access code"}>
        <p className="mb-4 text-sm text-muted">
          {remaining === 0 ? "Enter an access code to keep building." : user.unlimited ? "You have unlimited prompts." : `You have ${remaining} of ${user.promptLimit} prompts left. Have a code? Enter it below.`}
        </p>
        <form onSubmit={redeem} className="space-y-3">
          <input className={inputClass} placeholder="Enter access code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoCapitalize="characters" autoComplete="off" />
          <ErrorText>{error}</ErrorText>
          {success ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Close
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 4}>
              Unlock
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
