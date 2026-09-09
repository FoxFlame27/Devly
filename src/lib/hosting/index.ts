import "server-only";
import { LocalHosting } from "./local";
import type { HostingProvider } from "./types";

export function getHosting(): HostingProvider {
  // Swap in a Vercel/Netlify/S3 provider here; the rest of the app only uses the interface.
  return new LocalHosting();
}
