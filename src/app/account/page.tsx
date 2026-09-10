import { redirect } from "next/navigation";
import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { listUserProjects } from "@/lib/projects/list";
import { AppShell } from "@/components/AppShell";
import { AccountSettings } from "@/components/AccountSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const projects = await listUserProjects(user.id);
  return (
    <AppShell user={toSafeUser(user)} projects={projects}>
      <AccountSettings user={toSafeUser(user)} />
    </AppShell>
  );
}
