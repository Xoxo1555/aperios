import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildGoogleAuthUrl, isGoogleConfigured } from "lib/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google — starts the Google OAuth 2.0 flow.
 * Redirects the browser to Google's consent screen. The `next` query param
 * (the page the user should return to) is persisted in an http-only cookie
 * and consumed by the callback.
 */
export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const next = req.nextUrl.searchParams.get("next") || "/";
  const state = randomUUID();

  const res = NextResponse.redirect(buildGoogleAuthUrl(req.nextUrl.origin, state));
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("google_oauth_state", state, cookieOpts);
  res.cookies.set("google_oauth_next", next, cookieOpts);
  return res;
}
