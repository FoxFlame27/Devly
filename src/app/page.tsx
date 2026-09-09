import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { listUserProjects } from "@/lib/projects/list";
import { AppShell } from "@/components/AppShell";
import { HomePrompt } from "@/components/HomePrompt";
import { HowItWorks, RecentProjects } from "@/components/HomeExtras";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const projects = user ? await listUserProjects(user.id, 12) : [];
  return (
    <AppShell user={user ? toSafeUser(user) : null} projects={projects} active="home">
      <div className="flex flex-1 flex-col justify-center py-8">
        <HomePrompt user={user ? toSafeUser(user) : null} />
        <RecentProjects projects={projects} />
        <HowItWorks />
      </div>
    </AppShell>
  );
}
