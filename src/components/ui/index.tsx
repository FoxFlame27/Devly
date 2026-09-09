"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Mark } from "./Mark";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:opacity-90 disabled:bg-stone-300 disabled:text-stone-500 disabled:opacity-100",
  secondary: "bg-surface border border-line text-ink hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-muted hover:bg-stone-100 hover:text-ink disabled:text-stone-300",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "secondary", size = "md", loading, className = "", children, disabled, ...rest }, ref) {
    const sizes = { sm: "h-8 px-3 text-[13px] rounded-full", md: "h-9 px-4 text-sm rounded-full", lg: "h-11 px-6 text-[15px] rounded-full" };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-1.5 font-medium transition-colors select-none disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
        {...rest}
      >
        {loading ? <Spinner className="size-4" /> : null}
        {children}
      </button>
    );
  },
);

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`} aria-label="Y 5 home">
      <Mark size={24} />
      <span className="text-[15px] font-semibold tracking-tight">Y5</span>
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";

export function Modal({ open, onClose, title, children, width = "max-w-md" }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${width} rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl`} role="dialog" aria-modal>
        {title ? <h2 className="mb-3 text-base font-semibold">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}
