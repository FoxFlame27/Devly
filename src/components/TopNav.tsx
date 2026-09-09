import Link from "next/link";
import { Logo } from "./ui";
import { ThemePicker } from "./ThemePicker";

/** Marketing-style top bar for visitors who aren't signed in. */
export function TopNav() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
      <Logo />
      <nav className="flex items-center gap-3">
        <ThemePicker />
        <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-ink hover:bg-stone-100">
          Log in
        </Link>
        <Link href="/signup" className="rounded-full bg-accent px-4 py-1.5 text-sm text-white hover:brightness-95">
          Create account
        </Link>
      </nav>
    </header>
  );
}
