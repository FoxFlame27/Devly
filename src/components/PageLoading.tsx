import { Spinner } from "./ui";

/** Full-page loading state used by route loading.tsx files. */
export function PageLoading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="size-5" />
      <span>{text}</span>
    </div>
  );
}
