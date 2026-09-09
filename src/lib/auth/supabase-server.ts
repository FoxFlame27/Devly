import "server-only";
import { HttpError } from "../http";

function publishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function supabaseServerConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!publishableKey();
}

/**
 * Confirms an access token with Supabase Auth and returns the verified email.
 * Only the publishable key is used: the token itself proves the user completed the OTP.
 */
export async function verifySupabaseToken(accessToken: string): Promise<{ email: string; supabaseId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = publishableKey();
  if (!url || !key) throw new HttpError(500, "Email verification isn't configured.");
  if (!/^[A-Za-z0-9\-_.]{20,4096}$/.test(accessToken)) throw new HttpError(400, "Invalid token.");
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new HttpError(401, "Verification didn't go through. Please try again.", "bad_token");
  const user = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string | null };
  if (!user.id || !user.email) throw new HttpError(401, "Verification didn't go through. Please try again.", "bad_token");
  return { email: user.email.toLowerCase(), supabaseId: user.id };
}
