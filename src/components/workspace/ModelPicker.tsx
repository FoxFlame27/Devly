"use client";
import { useEffect, useRef, useState } from "react";
import type { EffortChoice, EffortOption, ModelOption } from "@/lib/client/types";

type Props = {
  models: ModelOption[];
  model: string;
  onModel: (id: string) => void;
  efforts: EffortOption[];
  effort: EffortChoice;
  onEffort: (e: EffortChoice) => void;
};

/** Slider order runs from least to most effort, with Auto in the middle. */
const SLIDER_ORDER: EffortChoice[] = ["low", "auto", "xhigh", "max"];

function shortName(label: string) {
  return label.replace(/^Claude\s+/i, "");
}

/** One quiet button; a panel with the model list and a draggable effort slider. */
export function ModelPicker({ models, model, onModel, efforts, effort, onEffort }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === model) ?? models[0];
  const stops = SLIDER_ORDER.map((id) => efforts.find((e) => e.id === id)).filter((e): e is EffortOption => !!e);
  const idx = Math.max(0, stops.findIndex((e) => e.id === effort));
  const currentEffort = stops[idx] ?? stops[0];
  const fill = stops.length > 1 ? (idx / (stops.length - 1)) * 100 : 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-stone-100 hover:text-ink"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose model and effort"
      >
        <span className="truncate font-medium text-ink">{shortName(current?.label ?? "Model")}</span>
        <span className="text-stone-400">·</span>
        <span className="truncate">{currentEffort?.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div role="dialog" className="rise absolute bottom-9 left-0 z-40 max-h-[70vh] w-[320px] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] scroll-thin">
          <div className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-muted">Model</div>
          {models.map((m) => {
            const active = m.id === model;
            return (
              <button key={m.id} type="button" onClick={() => onModel(m.id)} className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-accent-soft" : "hover:bg-stone-100"}`}>
                <span className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border ${active ? "border-accent bg-accent" : "border-stone-400"}`}>
                  {active ? (
                    <svg viewBox="0 0 14 14" className="size-full text-bg" aria-hidden>
                      <path d="M3.5 7.2 6 9.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{m.label}</span>
                  {m.description ? <span className="block text-[12px] leading-snug text-muted">{m.description}</span> : null}
                </span>
              </button>
            );
          })}
          <div className="mx-1.5 my-1.5 border-t border-line" />
          <div className="flex items-baseline justify-between px-2.5 pb-1 pt-1">
            <span className="text-[12px] font-medium text-muted">Effort</span>
            <span className="text-[13px] font-medium text-ink">{currentEffort?.label}</span>
          </div>
          <div className="px-3 pb-1 pt-2">
            <input
              type="range"
              min={0}
              max={stops.length - 1}
              step={1}
              value={idx}
              onChange={(e) => onEffort(stops[Number(e.target.value)].id)}
              className="slider w-full"
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
              aria-label="Effort"
              aria-valuetext={currentEffort?.label}
            />
            <div className="mt-1.5 flex justify-between">
              {stops.map((s, i) => (
                <button key={s.id} type="button" onClick={() => onEffort(s.id)} className={`text-[11px] ${i === idx ? "font-medium text-ink" : "text-muted hover:text-ink"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="min-h-9 px-3 pb-2.5 pt-1 text-[12px] leading-snug text-muted">{currentEffort?.description}</p>
        </div>
      ) : null}
    </div>
  );
}
