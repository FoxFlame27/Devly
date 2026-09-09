"use client";
import { useEffect, type RefObject } from "react";

/** Grows a textarea with its content up to maxPx, then scrolls. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 320) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [ref, value, maxPx]);
}
