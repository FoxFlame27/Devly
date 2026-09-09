"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React.JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { src?: string; poster?: string; "camera-controls"?: boolean; "auto-rotate"?: boolean; "shadow-intensity"?: string; exposure?: string };
    }
  }
}

let loading: Promise<void> | null = null;
function loadViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("viewer failed to load"));
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Interactive preview of a generated 3D model, with a quick way to ask for new textures. */
export function ModelCard({ projectId, file, name, onTexture, busy }: { projectId: string; file: string; name: string; onTexture: (prompt: string) => void; busy: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [style, setStyle] = useState("");
  useEffect(() => {
    let alive = true;
    loadViewer().then(() => alive && setReady(true)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  const src = `/api/projects/${projectId}/raw?path=${encodeURIComponent(file)}`;
  const poster = `/api/projects/${projectId}/raw?path=${encodeURIComponent(file.replace(/\.glb$/, ".png"))}`;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="relative h-64 bg-stone-100">
        {ready ? (
          <model-viewer src={src} poster={poster} camera-controls auto-rotate shadow-intensity="1" style={{ width: "100%", height: "100%" }} />
        ) : failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={name} className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted">Loading 3D preview...</div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          3D model · <span className="font-mono">{file.replace(/^public\//, "")}</span>
        </span>
        <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="New look, e.g. gold, rusty metal" className="h-7 w-44 rounded-md border border-line bg-surface px-2 text-xs outline-none focus:border-stone-400" />
        <Button size="sm" variant="secondary" disabled={!style.trim() || busy} onClick={() => onTexture(`Texture the 3D model "${name}" like this: ${style.trim()}`)}>
          Texture
        </Button>
      </div>
    </div>
  );
}
