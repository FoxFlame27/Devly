"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client used only for email OTP (send + verify).
 * Uses the publishable key, which is safe to expose. Sessions are kept by Devly's own cookie, not by Supabase.
 */
let client: SupabaseClient | null = null;

// Both names must appear literally so Next.js can inline them into the browser bundle.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Turns Supabase's error strings into something a person can act on. */
export function friendlyOtpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) return "That code is wrong or has expired. Check the newest email or send a new code.";
  if (m.includes("email rate limit")) return "The email service has hit its hourly sending limit. Please try again later.";
  if (m.includes("security purposes")) return "Please wait a moment before requesting another code.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("signups not allowed")) return "Sign-ups are currently disabled.";
  return message;
}
