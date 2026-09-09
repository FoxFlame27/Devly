import { assertSameOrigin, handler, json } from "@/lib/http";
import { destroySession } from "@/lib/auth/session";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession();
  return json({ ok: true });
});
