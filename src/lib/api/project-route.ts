import "server-only";
import type { Project, User } from "@prisma/client";
import { assertSameOrigin, errorResponse } from "../http";
import { requireProject, requireUser } from "../auth/session";

type Params = { params: Promise<{ id: string; [k: string]: string }> };

/** Route wrapper: authenticates, checks CSRF origin, and loads the project with an ownership check. */
export function projectRoute(fn: (req: Request, ctx: { user: User; project: Project; params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, { params }: Params) => {
    try {
      assertSameOrigin(req);
      const user = await requireUser();
      const p = await params;
      const project = await requireProject(p.id, user);
      return await fn(req, { user, project, params: p });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function authedRoute(fn: (req: Request, ctx: { user: User; params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      assertSameOrigin(req);
      const user = await requireUser();
      return await fn(req, { user, params: await params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
