"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { TimeAgo } from "./TimeAgo";
import type { ProjectSummary } from "@/lib/client/types";
import { Button, Modal } from "./ui";

export function ProjectList({ projects: initial }: { projects: ProjectSummary[] }) {
  const [projects, setProjects] = useState(initial);
  const [confirm, setConfirm] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(`/api/projects/${confirm.id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== confirm.id));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Projects</h1>
        <Button variant="primary" onClick={() => router.push("/")}>
          New Project
        </Button>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="text-muted">No projects yet.</p>
          <Link href="/" className="mt-3 inline-block text-sm font-medium text-ink underline">
            Build your first one
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {projects.map((p) => (
            <li key={p.id} className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
              <Link href={`/p/${p.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-muted">
                  Edited <TimeAgo date={p.updatedAt} />
                  {p.publishedAt ? " · Published" : ""}
                </div>
              </Link>
              <button onClick={() => setConfirm(p)} className="rounded-lg px-2 py-1 text-xs text-muted opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus:opacity-100">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={`Delete "${confirm?.name}"?`}>
        <p className="text-sm text-muted">This removes the project, its chat history and its published site. This can&apos;t be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
