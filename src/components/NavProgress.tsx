"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Thin progress bar at the top of the page while a navigation is in flight. */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A navigation finished: hide the bar (deferred so it never sets state synchronously in the effect).
    if (timer.current) clearTimeout(timer.current);
    const t = setTimeout(() => setActive(false), 80);
    return () => clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(false), 10000);
    };
    const onCustom = (e: Event) => {
      setActive((e as CustomEvent<boolean>).detail);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("devly:loading", onCustom);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("devly:loading", onCustom);
    };
  }, []);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity ${active ? "opacity-100" : "opacity-0"}`}>
      <div className={`h-full bg-accent ${active ? "nav-progress-run" : ""}`} />
    </div>
  );
}

/** Lets code that navigates programmatically show the bar: setNavLoading(true) before router.push. */
export function setNavLoading(on: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("devly:loading", { detail: on }));
}
