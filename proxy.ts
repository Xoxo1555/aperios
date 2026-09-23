import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "lib/session";
import type { Role } from "lib/types";

/**
 * Aperio route protection (edge).
 *
 *   - Every protected sub-route requires a valid signed session (JWT). The
 *     JWT is verified here for routing decisions only; each mutating API
 *     route independently re-validates the token server-side.
 *   - Role-based access control (RBAC):
 *       · /dashboard, /upload, /payout  → photographer | admin
 *       · /admin                        → admin only
 *       · /profile, /checkout, /orders, /settings, /collections → any
 *         authenticated user
 *   - Unauthenticated users are redirected to /login with the original URL
 *     preserved in a `callbackUrl` query param (open-redirect safe).
 *   - Authenticated users are kept out of /login and /register.
 */

type Rule = { type: "auth" } | { type: "role"; roles: readonly Role[] };

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

/** Only allow internal redirect targets to avoid open-redirect vulnerabilities. */
function safeCallbackUrl(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;

  /* Already authenticated → keep away from auth pages, honor callbackUrl. */
  if (AUTH_ONLY.includes(pathname as (typeof AUTH_ONLY)[number])) {
    if (user) {
      const raw = req.nextUrl.searchParams.get("callbackUrl") ?? req.nextUrl.searchParams.get("next");
      return NextResponse.redirect(new URL(safeCallbackUrl(raw), req.url));
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
    "/collections",
    "/purchases",
    "/wallet/:path*",
    "/login",
    "/register",
  ],
};