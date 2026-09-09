"use client";
import Link from "next/link";
import { ShoppingBag, Gamepad2, UtensilsCrossed, GraduationCap, Camera, Dumbbell } from "lucide-react";
import { TimeAgo } from "./TimeAgo";
import type { ProjectSummary } from "@/lib/client/types";

export const IDEAS = [
  { icon: Gamepad2, label: "Minecraft server site", prompt: "Build a modern website for my Minecraft server with a live server status box, a top-10 leaderboard, smooth animations and a dark theme." },
  { icon: Camera, label: "Photography portfolio", prompt: "Build a clean photography portfolio with a masonry gallery, an about page section and a contact form." },
  { icon: UtensilsCrossed, label: "Café landing page", prompt: "Build a warm landing page for a small café with the menu, opening hours, a map section and a reservation form." },
  { icon: ShoppingBag, label: "Product launch page", prompt: "Build a product launch page for a new pair of wireless headphones with feature highlights, pricing and an email sign-up." },
  { icon: GraduationCap, label: "Quiz app", prompt: "Build a fun multiple-choice quiz app about world capitals with a timer, score tracking and a results screen." },
  { icon: Dumbbell, label: "Workout tracker", prompt: "Build a workout tracker app where I can add exercises, log sets and reps, and see weekly progress charts." },
];

export function IdeaChips({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {IDEAS.map((i) => (
        <button key={i.label} type="button" onClick={() => onPick(i.prompt)} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted hover:border-stone-400 hover:text-ink">
          <i.icon size={14} /> {i.label}
        </button>
      ))}
    </div>
  );
}

export function RecentProjects({ projects }: { projects: ProjectSummary[] }) {
  if (!projects.length) return null;
  return (
    <section className="mx-auto mt-12 w-full max-w-3xl px-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Recent projects</h2>
        <Link href="/projects" className="text-sm text-muted hover:text-ink">
          All projects
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {projects.slice(0, 6).map((p) => (
          <li key={p.id}>
            <Link href={`/p/${p.id}`} className="block rounded-xl border border-line bg-surface px-4 py-3 hover:border-stone-400">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                {p.publishedAt ? "Published" : "Draft"} · <TimeAgo date={p.updatedAt} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
