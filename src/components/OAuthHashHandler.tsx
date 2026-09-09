"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";

/**
 * Google sign-in via Supabase comes back with the tokens in the URL hash. If Supabase sends the person to the
 * home page instead of /auth/callback (its redirect list didn't include the callback), this still logs them in.
 */
export function OAuthHashHandler() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    if (!accessToken) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    api("/api/auth/supabase", { method: "POST", json: { accessToken } })
      .then(() => {
        router.replace("/projects");
        router.refresh();
      })
      .catch(() => router.replace("/login?error=google"));
  }, [router]);
  return null;
}
