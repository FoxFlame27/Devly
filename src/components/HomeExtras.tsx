"use client";
import Link from "next/link";
import { ArrowRight, Eye, Globe, MessageSquare, PenLine, Rocket, ShoppingBag, Gamepad2, UtensilsCrossed, GraduationCap, Camera, Dumbbell } from "lucide-react";
import { timeAgo } from "@/lib/client/api";
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

const STEPS = [
  { icon: PenLine, title: "Describe it", text: "Say what you want in plain words." },
  { icon: Eye, title: "Watch it build", text: "The AI writes the code and runs it live." },
  { icon: MessageSquare, title: "Ask for changes", text: "Bigger buttons, new page, different colours." },
  { icon: Globe, title: "Publish", text: "One click and it's online with a link." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto mt-14 w-full max-w-3xl px-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-muted">
              <s.icon size={16} />
              <span className="text-[11px] font-medium uppercase tracking-wider">Step {i + 1}</span>
            </div>
            <div className="text-sm font-medium">{s.title}</div>
            <div className="mt-0.5 text-xs text-muted">{s.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecentProjects({ projects }: { projects: ProjectSummary[] }) {
  if (!projects.length) return null;
  return (
    <section className="mx-auto mt-12 w-full max-w-3xl px-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted">
          <Rocket size={14} /> Recent projects
        </h2>
        <Link href="/projects" className="flex items-center gap-1 text-sm text-muted hover:text-ink">
          All projects <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {projects.slice(0, 6).map((p) => (
          <li key={p.id}>
            <Link href={`/p/${p.id}`} className="block rounded-xl border border-line bg-surface px-4 py-3 hover:border-stone-400">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {p.publishedAt ? <Globe size={12} /> : <PenLine size={12} />}
                {p.publishedAt ? "Published" : "Draft"} · {timeAgo(p.updatedAt)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
