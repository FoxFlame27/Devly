"use client";
/** Remembers the project you were last working in, so coming back resumes it instead of starting fresh. */
const KEY = "devly.lastProject";

export function rememberLastProject(id: string, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, name, at: Date.now() }));
    document.cookie = `devly_last=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function lastProject(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id: string; name: string };
    return v?.id ? v : null;
  } catch {
    return null;
  }
}

export function forgetLastProject(id?: string) {
  try {
    const cur = lastProject();
    if (!id || cur?.id === id) {
      localStorage.removeItem(KEY);
      document.cookie = "devly_last=; path=/; max-age=0";
    }
  } catch {
    /* ignore */
  }
}

/** Where to send someone after signing in: their last project if they have one, else the projects list. */
export function afterLoginPath(fallback = "/projects"): string {
  const p = lastProject();
  return p ? `/p/${p.id}` : fallback;
}
