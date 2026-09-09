"use client";
import { useEffect, useState } from "react";

type ThemeId = "graphite" | "paper";

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.style.colorScheme = id === "paper" ? "light" : "dark";
  try {
    localStorage.setItem("y5.theme", id);
  } catch {
    /* ignore */
  }
}

/** One button: switches between the dark (Graphite) and light (Paper) look. */
export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>("paper");
  useEffect(() => {
    const t = setTimeout(() => setTheme(document.documentElement.getAttribute("data-theme") === "graphite" ? "graphite" : "paper"), 0);
    return () => clearTimeout(t);
  }, []);
  const next: ThemeId = theme === "paper" ? "graphite" : "paper";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      className="grid size-8 place-items-center rounded-full text-muted hover:bg-stone-100 hover:text-ink"
      title={theme === "paper" ? "Switch to dark" : "Switch to light"}
      aria-label={theme === "paper" ? "Switch to dark theme" : "Switch to light theme"}
    >
      {theme === "paper" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
