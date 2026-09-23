import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "./types";

/**
 * Edge-safe JWT session primitives (no `server-only`, no DB, no Node APIs).
 * Shared by the edge middleware (route protection) and the Node server
 * (`lib/auth.ts`). The token embeds the user's id, email and role — the
 * middleware only reads the role to apply RBAC route rules; every mutating
 * API endpoint independently re-validates the token server-side.
 */
export const SESSION_COOKIE = "aperio_session";
export const SESSION_TTL = "14d";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Define it in your environment before starting the server."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(String(user.id))
    .setExpirationTime(SESSION_TTL)
    .sign(jwtSecret());
}

/** Verifies the JWT signature + expiry and returns a sanitized SessionUser. */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    const u = payload as unknown as SessionUser;
    if (!u || typeof u.id !== "number" || !u.email || typeof u.name !== "string") {
      return null;
    }
    if (u.role !== "admin" && u.role !== "photographer" && u.role !== "buyer") {
      return null;
    }
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarUrl: typeof u.avatarUrl === "string" ? u.avatarUrl : null,
      coverImage: typeof u.coverImage === "string" ? u.coverImage : null,
      bio: typeof u.bio === "string" ? u.bio : null,
      location: typeof u.location === "string" ? u.location : null,
      donationLink: typeof u.donationLink === "string" ? u.donationLink : null,
      instagram: typeof u.instagram === "string" ? u.instagram : null,
    };
  } catch {
    return null;
  }
}