import "server-only";
import type { User } from "@prisma/client";
import { assertSameOrigin, errorResponse } from "../http";
import { requireAdmin } from "../auth/session";

/** Route wrapper enforcing the ADMIN role server-side. */
export function adminRoute(fn: (req: Request, ctx: { admin: User; params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      assertSameOrigin(req);
      const admin = await requireAdmin();
      return await fn(req, { admin, params: await params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
