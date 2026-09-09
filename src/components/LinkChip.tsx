"use client";
import { useState } from "react";

const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g;

export function findUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(URL_RE) ?? []) if (!out.includes(m)) out.push(m);
  return out.slice(0, 8);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Small pill with the site's favicon; opens the link in a new tab. */
export function LinkChip({ url, label, className = "" }: { url: string; label?: string; className?: string }) {
  const host = hostOf(url);
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 align-middle text-xs text-ink no-underline hover:border-stone-400 ${className}`}
    >
      {broken ? (
        <span className="grid size-4 place-items-center rounded-sm bg-stone-200 text-[9px] uppercase text-muted">{host.slice(0, 1)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`} alt="" width={16} height={16} className="size-4 rounded-sm" onError={() => setBroken(true)} />
      )}
      <span className="truncate">{label && label !== url ? label : host}</span>
    </a>
  );
}

/** Renders plain text with any URLs replaced by link chips. */
export function TextWithLinks({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(<LinkChip key={`${i}-${m[0]}`} url={m[0]} className="mx-0.5" />);
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
