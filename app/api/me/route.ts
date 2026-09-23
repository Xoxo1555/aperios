import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { getSessionUser, hashPassword, signSessionToken, toSessionUser } from "lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "lib/session";
import { isUniqueViolation } from "lib/pg-errors";
import { profileUpdateSchema } from "lib/validation";

export const dynamic = "force-dynamic";

/** Read the current session user */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  return NextResponse.json({ user: toSessionUser(row) });
}

/** Update current user profile (onboarding, avatar, payout info) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.location !== undefined) updates.location = body.location;
  if (body.website !== undefined) updates.website = body.website ? body.website : null;
  if (body.instagram !== undefined) updates.instagram = body.instagram;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.country !== undefined) updates.country = body.country;
  if (body.specialties !== undefined) updates.specialties = body.specialties;
  if (body.interests !== undefined) updates.interests = body.interests;

  /* Payout setup */
  if (body.payoutMethod !== undefined) updates.payoutMethod = body.payoutMethod;
  if (body.payoutAccount !== undefined) updates.payoutAccount = body.payoutAccount;
  if (body.payoutName !== undefined) updates.payoutName = body.payoutName;

  /* Password change — requires the current password, verified server-side. */
  if (body.currentPassword && body.newPassword) {
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    const bcrypt = await import("bcryptjs");
    const ok = await bcrypt.compare(body.currentPassword, row.passwordHash);
    if (!ok) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });
    updates.passwordHash = await hashPassword(body.newPassword);
  }

  /* Email change requires re-verification */
  if (body.email !== undefined && body.email !== user.email) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });
    updates.email = body.email;
    updates.emailVerified = false;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ user: toSessionUser({ ...user }) });
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, user.id));
  } catch (err) {
    /* Course : deux changements d'e-mail simultanés vers la même adresse. Le
     * pré-check SELECT ci-dessus ne suffit pas sous concurrence ; on rattrape
     * la violation d'unicité (23505, encapsulée par drizzle) pour 409. */
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 });
    }
    throw err;
  }
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  const refreshed = toSessionUser(row);
  const token = await signSessionToken(refreshed);
  const res = NextResponse.json({ user: refreshed });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}