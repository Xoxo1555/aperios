import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { MailDeliveryError } from "lib/mailer";
import { isUniqueViolation } from "lib/pg-errors";
import { guardedAuth, rateLimited } from "lib/auth-http";
import {
  assertAllowedRegister,
  checkLoginAllowed,
  clientIp,
  recordLoginFailure,
  recordLoginSuccess,
} from "lib/auth-attempts";
import {
  SESSION_COOKIE,
  dispatchEmailVerification,
  getSessionUser,
  hashPassword,
  signSessionToken,
  toSessionUser,
  verifyPassword,
} from "lib/auth";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  /* ---------------- Register ---------------- */
  if (action === "register") {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const confirm = String(body.confirm ?? "");
    const role = body.role === "photographer" ? "photographer" : "buyer";
    const phone = String(body.phone ?? "").trim() || null;
    const country = String(body.country ?? "").trim() || null;
    const location = String(body.location ?? "").trim() || null;
    const specialties = role === "photographer" ? (String(body.specialties ?? "").trim() || null) : null;
    const interests = role === "buyer" ? (String(body.interests ?? "").trim() || null) : null;

    if (name.length < 2) {
      return NextResponse.json({ error: "Veuillez saisir un nom d'utilisateur." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Veuillez saisir un email valide." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
    }
    if (password !== confirm) {
      return NextResponse.json({ error: "Les mots de passe ne correspondent pas." }, { status: 400 });
    }

    /* (e) Per-IP registration gate — checked before any DB read so a hostile
     * visitor cannot hammer the accounts table or the catalog of existing
     * emails. */
    const registerGate = await guardedAuth(() => assertAllowedRegister(clientIp(req)));
    if (registerGate instanceof NextResponse) return registerGate;
    if (!registerGate.allowed) {
      return rateLimited(
        "Trop de comptes créés depuis cet appareil. Réessayez plus tard.",
        registerGate.retryAfterSec,
      );
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email.", code: "EMAIL_TAKEN" },
        { status: 409 },
      );
    }

    const hash = await hashPassword(password);
    let u: typeof users.$inferSelect;
    try {
      [u] = await db
        .insert(users)
        .values({
          name, email, passwordHash: hash, role, emailVerified: false,
          phone, country, location, specialties, interests,
        })
        .returning();
    } catch (err) {
      /* Course : deux inscriptions simultanées avec le même e-mail. Le
       * pré-check SELECT ci-dessus ne suffit pas sous concurrence ; on rattrape
       * la violation d'unicité (23505, encapsulée par drizzle) pour 409. */
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "Un compte existe déjà avec cet email.", code: "EMAIL_TAKEN" },
          { status: 409 },
        );
      }
      throw err;
    }

    try {
      await dispatchEmailVerification(u.id, u.email, u.name);
    } catch (err) {
      await db.delete(users).where(eq(users.id, u.id));
      if (err instanceof MailDeliveryError) {
        return NextResponse.json(
          { error: `Impossible d'envoyer le code de confirmation : ${err.message}` },
          { status: 500 },
        );
      }
      throw err;
    }

    return NextResponse.json(
      {
        user: toSessionUser(u),
        needsVerification: true,
        message: "Compte créé avec succès. Un code de confirmation à 6 chiffres a été envoyé à votre adresse email.",
      },
      { status: 201 },
    );
  }

  /* ---------------- Login ---------------- */
  if (action === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const ip = clientIp(req);

    /* (b) Fail-closed gate BEFORE the credentials lookup — on a locked
     * account we never even touch the users table or bcrypt. */
    const loginGate = await guardedAuth(() => checkLoginAllowed(email, ip));
    if (loginGate instanceof NextResponse) return loginGate;
    if (!loginGate.allowed) {
      return rateLimited(
        "Trop de tentatives de connexion. Réessayez plus tard.",
        loginGate.retryAfterSec,
      );
    }

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const u = rows[0];
    if (!u || !(await verifyPassword(password, u.passwordHash))) {
      /* Same generic message for a missing account and a wrong password —
       * the limiter counters (email+ip / ip / email) still move. */
      const recorded = await guardedAuth(() => recordLoginFailure(email, ip));
      if (recorded instanceof NextResponse) return recorded;
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect.", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }
    if (!u.emailVerified) {
      return NextResponse.json(
        { error: "Votre email n'est pas encore vérifié.", needsVerification: true, email: u.email },
        { status: 403 },
      );
    }
    const cleared = await guardedAuth(() => recordLoginSuccess(email, ip));
    if (cleared instanceof NextResponse) return cleared;
    const token = await signSessionToken(toSessionUser(u));
    const res = NextResponse.json({ user: toSessionUser(u) });
    return setSessionCookie(res, token);
  }

  /* ---------------- Logout ---------------- */
  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
