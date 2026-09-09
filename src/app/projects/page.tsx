import { redirect } from "next/navigation";
import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { listUserProjects } from "@/lib/projects/list";
import { AppShell } from "@/components/AppShell";
import { ProjectList } from "@/components/ProjectList";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/projects");
  const projects = await listUserProjects(user.id);
  return (
    <AppShell user={toSafeUser(user)} projects={projects} active="projects">
      <ProjectList projects={projects} />
    </AppShell>
  );
}
