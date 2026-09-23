import "server-only";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { hashPassword, toSessionUser } from "lib/auth";
import type { SessionUser } from "lib/types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleRedirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(origin: string, state: string): string {
  const redirectUri = getGoogleRedirectUri(origin);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string | null;
  email_verified?: boolean;
}

export async function exchangeGoogleCode(code: string, origin: string): Promise<string> {
  const redirectUri = getGoogleRedirectUri(origin);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (HTTP ${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo fetch failed (HTTP ${res.status}).`);
  }
  return (await res.json()) as GoogleProfile;
}

/**
 * Finds an existing Aperio account by email or creates a new buyer account
 * from the Google profile. Google-issued emails are treated as verified, so
 * the user lands directly in a signed-in session (no confirmation email).
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<SessionUser> {
  const email = profile.email.toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    // Keep the avatar in sync with Google's latest picture when available.
    if (profile.picture && existing.avatarUrl !== profile.picture) {
      await db
        .update(users)
        .set({ avatarUrl: profile.picture, emailVerified: true })
        .where(eq(users.id, existing.id));
      return toSessionUser({ ...existing, avatarUrl: profile.picture });
    }
    if (!existing.emailVerified) {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, existing.id));
    }
    return toSessionUser(existing);
  }

  const [created] = await db
    .insert(users)
    .values({
      name: profile.name || email.split("@")[0],
      email,
      emailVerified: true,
      avatarUrl: profile.picture,
      // Random, unguessable password — Google users authenticate via OAuth.
      passwordHash: await hashPassword(randomBytes(24).toString("hex")),
      role: "buyer",
    })
    .returning();

  return toSessionUser(created);
}
