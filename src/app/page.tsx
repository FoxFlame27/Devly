import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { listUserProjects } from "@/lib/projects/list";
import { AppShell } from "@/components/AppShell";
import { HomePrompt } from "@/components/HomePrompt";
import { RecentProjects } from "@/components/HomeExtras";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <main className="flex flex-1 flex-col justify-center pb-24">
          <HomePrompt user={null} />
        </main>
      </div>
    );
  }
  const projects = await listUserProjects(user.id, 12);
  return (
    <AppShell user={toSafeUser(user)} projects={projects} active="home">
      <div className="flex flex-1 flex-col justify-center py-8">
        <HomePrompt user={toSafeUser(user)} />
        <RecentProjects projects={projects} />
      </div>
    </AppShell>
  );
}
