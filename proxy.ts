import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveSessionUser, SESSION_COOKIE } from "lib/session";
import { resolveCallbackUrl } from "lib/navigation";
import type { Role } from "lib/types";

/**
 * Aperio route protection (Proxy, runtime Node sous Next 16).
 *
 *   - Every protected sub-route requires a valid signed session (JWT) whose
 *     account still exists with the same role in the DB. Mutating API routes
 *     re-check the session through `lib/auth` before any side effect.
 *   - Role-based access control (RBAC):
 *       · /dashboard, /upload, /payout  → photographer | admin
 *       · /admin                        → admin only
 *       · /profile, /checkout, /orders, /settings, /collections → any
 *         authenticated user
 *   - Unauthenticated users are redirected to /login with the original URL
 *     preserved in a `callbackUrl` query param (open-redirect safe).
 *   - Authenticated users are kept out of /login and /register.
 *
 * API routes are intentionally absent from `config.matcher`. The proxy only
 * redirects browsers; returning a 302 to a `fetch()` caller would leak the
 * login page instead of an auth error. Every handler under `app/api/**`
 * therefore enforces auth itself:
 *   - session routes call `getSessionUser` / `requireSession` /
 *     `requireRole` from `lib/auth` and return 401/403 as JSON;
 *   - ownership checks (order, payout, collection, photo) are done in the
 *     handler against the session user id;
 *   - webhooks authenticate through `lib/webhookAuth` and fail closed.
 * Adding `/api/:path*` to the matcher would not replace those checks; it
 * would only mask missing ones behind a redirect.
 */

type Rule = { type: "auth" } | { type: "role"; roles: readonly Role[] };

/* Keys are path prefixes: `/purchases` also matches `/purchases/<id>/...`
   through `getRule`. Do not append `/:path*` here. */
const ROUTE_RULES: Record<string, Rule> = {
  "/dashboard": { type: "role", roles: ["photographer", "admin"] },
  "/upload": { type: "role", roles: ["photographer", "admin"] },
  "/payout": { type: "role", roles: ["photographer", "admin"] },
  "/admin": { type: "role", roles: ["admin"] },
  "/profile": { type: "auth" },
  "/checkout": { type: "auth" },
  "/orders": { type: "auth" },
  "/settings": { type: "auth" },
  "/collections": { type: "auth" },
  "/purchases": { type: "auth" },
  "/wallet": { type: "auth" },
};

const AUTH_ONLY = ["/login", "/register"] as const;

function getRule(pathname: string): Rule | null {
  for (const [prefix, rule] of Object.entries(ROUTE_RULES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return rule;
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await resolveSessionUser(token) : null;

  /* Already authenticated → keep away from auth pages, honor callbackUrl. */
  if (AUTH_ONLY.includes(pathname as (typeof AUTH_ONLY)[number])) {
    if (user) {
      const raw = req.nextUrl.searchParams.get("callbackUrl") ?? req.nextUrl.searchParams.get("next");
      return NextResponse.redirect(new URL(resolveCallbackUrl(raw), req.url));
    }
    return NextResponse.next();
  }

  const rule = getRule(pathname);
  if (!rule) return NextResponse.next();

  /* Not authenticated → preserve the intended destination. */
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  /* Authenticated but not allowed for this role → back to home. */
  if (rule.type === "role" && !rule.roles.includes(user.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/upload/:path*",
    "/payout/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/checkout/:path*",
    "/orders/:path*",
    "/settings/:path*",
    "/collections/:path*",
    "/purchases/:path*",
    "/wallet/:path*",
    "/login",
    "/register",
  ],
};