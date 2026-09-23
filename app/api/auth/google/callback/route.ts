import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, signSessionToken } from "lib/auth";
import { exchangeGoogleCode, fetchGoogleProfile, findOrCreateGoogleUser, isGoogleConfigured } from "lib/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback — Google OAuth 2.0 redirect target.
 * Exchanges the authorization code, loads the profile, finds/creates the
 * user, sets the session cookie and redirects back to the originating page.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  function fail(error: string) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url);
  }

  if (!isGoogleConfigured()) return fail("google_not_configured");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("google_oauth_state")?.value;
  const next = req.cookies.get("google_oauth_next")?.value || "/";

  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("google_invalid_state");
  }

  try {
    const accessToken = await exchangeGoogleCode(code, origin);
    const profile = await fetchGoogleProfile(accessToken);
    if (!profile.email) return fail("google_no_email");

    const sessionUser = await findOrCreateGoogleUser(profile);
    const token = await signSessionToken(sessionUser);

    const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const res = NextResponse.redirect(new URL(target, origin));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    res.cookies.delete("google_oauth_state");
    res.cookies.delete("google_oauth_next");
    return res;
  } catch (err) {
    console.error("[google/callback]", err);
    return fail("google_failed");
  }
}
