import "server-only";
import { env } from "../env";

export type Mail = { to: string; subject: string; text: string; html?: string };

export interface EmailProvider {
  readonly name: string;
  send(mail: Mail): Promise<void>;
}

/** Resend (https://resend.com): free tier, simple HTTP API. */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  async send(mail: Mail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env().EMAIL_FROM ?? "Devly <onboarding@resend.dev>", to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** No email service configured: prints the mail to the server log (development only). */
class ConsoleProvider implements EmailProvider {
  readonly name = "console";
  async send(mail: Mail) {
    console.log(`\n[email] To: ${mail.to}\n[email] ${mail.subject}\n[email] ${mail.text}\n`);
  }
}

export function getEmailProvider(): EmailProvider {
  return env().RESEND_API_KEY ? new ResendProvider() : new ConsoleProvider();
}

/** Whether login/signup require an emailed code. Defaults to on. Set EMAIL_VERIFY=false to disable. */
export function emailVerificationEnabled(): boolean {
  return env().EMAIL_VERIFY !== "false";
}
