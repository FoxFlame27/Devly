"use client";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client/api";

/** Relative time that never causes a hydration mismatch (server value is kept until the client updates it). */
export function TimeAgo({ date }: { date: string | Date }) {
  const [text, setText] = useState(() => timeAgo(date));
  useEffect(() => {
    const tick = () => setText(timeAgo(date));
    const t = setInterval(tick, 30_000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [date]);
  return <span suppressHydrationWarning>{text}</span>;
}
