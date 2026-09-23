import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "db";
import { emailVerifications, passwordResets, users } from "db/schema";
import { codeHash, generateNumericCode, verifyCodeAttempt } from "./auth-attempts";
import { passwordResetEmailHtml, sendMail, verificationEmailHtml } from "./mailer";
import { SESSION_COOKIE, signSessionToken, verifySessionToken } from "./session";
export { SESSION_COOKIE, signSessionToken, verifySessionToken } from "./session";
import type { Role, SessionUser } from "./types";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Define it in your .env file before starting the server."
  );
}
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function toSessionUser(u: {
  id: number; name: string; email: string; role: string;
  avatarUrl: string | null; coverImage: string | null;
  bio: string | null; location: string | null;
  donationLink?: string | null; instagram?: string | null;
}): SessionUser {
  return {
    id: u.id, name: u.name, email: u.email,
    role: u.role as SessionUser["role"],
    avatarUrl: u.avatarUrl, coverImage: u.coverImage,
    bio: u.bio, location: u.location,
    donationLink: u.donationLink ?? null, instagram: u.instagram ?? null,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Server-side session guard for route handlers / server actions.
 * Returns the validated session user or null when no valid session exists.
 * Every mutating endpoint MUST call this and never trust client data.
 */
export async function requireSession(): Promise<SessionUser | null> {
  return getSessionUser();
}

/** Returns the session user only if they hold one of the given roles. */
export async function requireRole(roles: readonly Role[]): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!roles.includes(user.role)) return null;
  return user;
}

/** Convenience guards for the three roles. */
export const requireAdmin = () => requireRole(["admin"]);
export const requireCreator = () => requireRole(["photographer", "admin"]);

/* ---------------- Email verification ---------------- */

export async function createEmailVerificationCode(userId: number): Promise<string> {
  const code = generateNumericCode();
  await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  await db.insert(emailVerifications).values({
    userId,
    codeHash: codeHash("verify", userId, code),
    expiresAt: new Date(Date.now() + 1000 * 60 * 30),
  });
  return code;
}

/** Creates a verification code and dispatches it by real email. Throws a
 *  MailDeliveryError if SMTP isn't configured or delivery fails. */
export async function dispatchEmailVerification(
  userId: number,
  email: string,
  name: string,
): Promise<void> {
  const code = await createEmailVerificationCode(userId);
  await sendMail({
    to: email,
    subject: "Votre code de vérification Aperio",
    html: verificationEmailHtml(code, name),
  });
}

/** Verifies a verification code. Returns the (now verified) session user, or
 *  null if the code is invalid/expired/invalidated. */
export async function verifyEmailCode(email: string, code: string): Promise<SessionUser | null> {
  const out = await verifyEmailCodeDetailed(email, code);
  return out.kind === "ok" ? out.user : null;
}

export type VerifyEmailOutcome =
  | { kind: "ok"; user: SessionUser }
  | { kind: "too_many"; retryAfterSec: number | null }
  | { kind: "invalid" | "expired" | "invalidated" };

/** Full outcome of a code attempt — lets the API route surface 429
 *  (RATE_LIMITED, anti-spray lock) and per-status 400 codes instead of a
 *  single generic failure. */
export async function verifyEmailCodeDetailed(email: string, code: string): Promise<VerifyEmailOutcome> {
  const res = await verifyCodeAttempt("verify", email, code, { consumeOnSuccess: true });
  if (res.status === "too_many") return { kind: "too_many", retryAfterSec: res.retryAfterSec };
  if (res.status !== "ok") return { kind: res.status };
  if (res.userId == null) return { kind: "invalid" };

  const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
  if (!user) return { kind: "invalid" };
  if (!user.emailVerified) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  }
  return { kind: "ok", user: toSessionUser(user) };
}

/* ---------------- Password reset ---------------- */

export async function createPasswordResetCode(userId: number): Promise<string> {
  const code = generateNumericCode();
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
  await db.insert(passwordResets).values({
    userId,
    codeHash: codeHash("reset", userId, code),
    expiresAt: new Date(Date.now() + 1000 * 60 * 30),
  });
  return code;
}

/** Creates a reset code and dispatches it by real email. Throws a
 *  MailDeliveryError if SMTP isn't configured or delivery fails. */
export async function dispatchPasswordReset(
  userId: number,
  email: string,
  name: string,
): Promise<void> {
  const code = await createPasswordResetCode(userId);
  await sendMail({
    to: email,
    subject: "Réinitialisation de votre mot de passe Aperio",
    html: passwordResetEmailHtml(code, name),
  });
}

/** Verifies a reset code without consuming it — used before showing the new-password step. */
export async function checkPasswordResetCode(email: string, code: string): Promise<boolean> {
  const out = await checkPasswordResetCodeDetailed(email, code);
  return out.kind === "ok";
}

export type CheckCodeOutcome =
  | { kind: "ok" }
  | { kind: "too_many"; retryAfterSec: number | null }
  | { kind: "invalid" | "expired" | "invalidated" };

/** Full outcome of the forgot `check` pre-step (does not consume the code). */
export async function checkPasswordResetCodeDetailed(email: string, code: string): Promise<CheckCodeOutcome> {
  const res = await verifyCodeAttempt("reset", email, code, { consumeOnSuccess: false });
  if (res.status === "too_many") return { kind: "too_many", retryAfterSec: res.retryAfterSec };
  if (res.status !== "ok") return { kind: res.status };
  return { kind: "ok" };
}

/** Verifies the code, sets the new password, and consumes the reset code. Returns the user on success. */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<SessionUser | null> {
  const out = await resetPasswordWithCodeDetailed(email, code, newPassword);
  return out.kind === "ok" ? out.user : null;
}

export type ResetPasswordOutcome =
  | { kind: "ok"; user: SessionUser }
  | { kind: "too_many"; retryAfterSec: number | null }
  | { kind: "invalid" | "expired" | "invalidated" };

/** Full outcome of the forgot `reset` step (consumes the code on success). */
export async function resetPasswordWithCodeDetailed(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordOutcome> {
  const res = await verifyCodeAttempt("reset", email, code, { consumeOnSuccess: true });
  if (res.status === "too_many") return { kind: "too_many", retryAfterSec: res.retryAfterSec };
  if (res.status !== "ok") return { kind: res.status };
  if (res.userId == null) return { kind: "invalid" };

  const hash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, res.userId));
  const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
  if (!user) return { kind: "invalid" };
  return { kind: "ok", user: toSessionUser(user) };
}
