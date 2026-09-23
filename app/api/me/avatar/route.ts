import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { getSessionUser, signSessionToken, toSessionUser } from "lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "lib/session";
import { saveUploadedFile } from "lib/upload";
import { avatarUploadSchema } from "lib/validation";

export const dynamic = "force-dynamic";

/** Upload a new avatar image for the current user */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = avatarUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Image invalide." }, { status: 400 });
  }

  try {
    const saved = await saveUploadedFile(parsed.data.image, "avatars");
    await db.update(users).set({ avatarUrl: saved.url }).where(eq(users.id, user.id));

    // Refresh the JWT with the new avatarUrl
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!updated) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    const refreshed = toSessionUser(updated);
    const token = await signSessionToken(refreshed);
    const res = NextResponse.json({
      user: refreshed,
      avatarUrl: saved.url,
      sizeBytes: saved.sizeBytes,
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Delete the user's avatar */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id));
  const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!updated) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  const refreshed = toSessionUser(updated);
  const token = await signSessionToken(refreshed);
  const res = NextResponse.json({ user: refreshed });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}