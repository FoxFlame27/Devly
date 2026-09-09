import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, toSafeUser } from "@/lib/auth/session";
import { availableModels, defaultModel } from "@/lib/ai/models";
import { EFFORT_OPTIONS } from "@/config/models";
import { getHosting } from "@/lib/hosting";
import { siteOrigin } from "@/lib/hosting/local";
import { Workspace } from "@/components/workspace/Workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/p/${id}`)}`);
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || (project.ownerId !== user.id && user.role !== "ADMIN")) notFound();
  await db.project.update({ where: { id }, data: { lastOpenedAt: new Date() } });
  return (
    <Workspace
      project={{
        id: project.id,
        name: project.name,
        template: project.template,
        description: project.description,
        updatedAt: project.updatedAt.toISOString(),
        publishedUrl: project.publishedSlug ? `${siteOrigin()}${getHosting().basePath(project.publishedSlug).replace(/\/$/, "")}` : null,
        publishedAt: project.publishedAt?.toISOString() ?? null,
        settings: (project.settings as { model?: string; effort?: string } | null) ?? null,
      }}
      user={toSafeUser(user)}
      models={availableModels()}
      defaultModel={defaultModel()}
      efforts={EFFORT_OPTIONS}
      defaultEffort="auto"
    />
  );
}
