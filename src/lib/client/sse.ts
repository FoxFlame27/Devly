"use client";

/** POSTs JSON and reads a Server-Sent Events response, invoking onEvent for each `data:` payload. */
export async function streamSse<T>(url: string, body: unknown, onEvent: (e: T) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-requested-with": "fetch", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const d = (await res.json()) as { error?: string; code?: string };
      msg = d.error ?? msg;
      code = d.code;
    } catch {
      /* ignore */
    }
    const err = new Error(msg) as Error & { status: number; code?: string };
    err.status = res.status;
    err.code = code;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)) as T);
          } catch {
            /* skip malformed */
          }
        }
      }
    }
  }
}
