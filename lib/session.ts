import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import type { SessionUser } from "./types";

/**
 * JWT session primitives shared by the Proxy (Next 16 Node runtime) and the
 * Node server (`lib/auth.ts`). The token embeds id, email and role; a signed
 * token alone is not authoritative, so `resolveSessionUser` also checks the
 * account and its role in the DB.
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
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 random characters in production (e.g. openssl rand -hex 32)."
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

/** DB-backed check: the account must still exist with the role in the token. */
export async function resolveSessionUser(token: string): Promise<SessionUser | null> {
  const user = await verifySessionToken(token);
  if (!user) return null;
  try {
    const [account] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!account || account.role !== user.role) return null;
  } catch {
    return null;
  }
  return user;
}