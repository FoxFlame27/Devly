"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui";
import { setNavLoading } from "@/components/NavProgress";
import { afterLoginPath } from "@/lib/client/lastProject";

/** Landing page after Google sign-in: turns Supabase's token into a Devly session. */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const desc = hash.get("error_description") || params.get("error_description");
    const t = setTimeout(async () => {
      if (!accessToken) {
        setError(desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : "Google sign-in didn't complete. Please try again.");
        return;
      }
      try {
        await api("/api/auth/supabase", { method: "POST", json: { accessToken } });
        const next = params.get("next") || afterLoginPath();
        window.history.replaceState(null, "", window.location.pathname);
        setNavLoading(true);
        router.replace(next.startsWith("/") ? next : "/projects");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [params, router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/devly-logo.png" alt="Devly" className="h-20 w-auto rounded-2xl bg-[#1f1e1b] px-6 py-2" />
      {error ? (
        <div className="max-w-sm text-center">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          <a href="/login" className="mt-3 inline-block text-sm text-ink underline">
            Back to login
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> Logged in with Google. Opening your projects...
        </div>
      )}
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
