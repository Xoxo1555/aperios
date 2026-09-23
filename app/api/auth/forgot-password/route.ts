import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { MailDeliveryError } from "lib/mailer";
import { guardedAuth, rateLimited } from "lib/auth-http";
import { assertAllowedDispatch } from "lib/auth-attempts";
import {
  SESSION_COOKIE,
  checkPasswordResetCodeDetailed,
  dispatchPasswordReset,
  resetPasswordWithCodeDetailed,
  signSessionToken,
} from "lib/auth";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CODE_ERRORS: Record<"invalid" | "expired" | "invalidated", { code: string; message: string }> = {
  invalid: { code: "CODE_INVALID", message: "Code invalide ou expiré. Demandez un nouveau code." },
  expired: { code: "CODE_EXPIRED", message: "Ce code a expiré. Demandez un nouveau code." },
  invalidated: {
    code: "CODE_INVALIDATED",
    message: "Trop de tentatives pour ce code. Demandez un nouveau code.",
  },
};

const NEUTRAL_MESSAGE =
  "Si un compte existe pour cet email, un code de réinitialisation a été envoyé.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Veuillez saisir un email valide." }, { status: 400 });
  }

  /* ---------------- Request a reset code ---------------- */
  if (action === "request") {
    /* (c) Dispatch quota FIRST, before any account lookup. */
    const requestGate = await guardedAuth(() => assertAllowedDispatch(email));
    if (requestGate instanceof NextResponse) return requestGate;
    if (!requestGate.allowed) {
      return rateLimited(
        "Veuillez patienter avant de demander un nouveau code.",
        requestGate.retryAfterSec,
      );
    }

    const row = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    /* Always the same response whether or not the account exists — this
     * avoids leaking which emails are registered on the platform. */
    if (!row[0]) {
      return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
    }

    try {
      await dispatchPasswordReset(row[0].id, email, row[0].name);
    } catch (err) {
      if (err instanceof MailDeliveryError) {
        return NextResponse.json(
          { error: `Impossible d'envoyer l'e-mail de réinitialisation : ${err.message}` },
          { status: 500 },
        );
      }
      throw err;
    }
    return NextResponse.json({ ok: true, message: NEUTRAL_MESSAGE });
  }

  /* ---------------- Check a code (before showing the new-password step) ---------------- */
  if (action === "check") {
    const code = String(body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Le code doit contenir 6 chiffres." }, { status: 400 });
    }
    const out = await checkPasswordResetCodeDetailed(email, code);
    if (out.kind === "too_many") {
      return rateLimited("Trop de tentatives. Réessayez plus tard.", out.retryAfterSec);
    }
    if (out.kind !== "ok") {
      const e = CODE_ERRORS[out.kind];
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  /* ---------------- Set the new password ---------------- */
  if (action === "reset") {
    const code = String(body.code ?? "").trim();
    const password = String(body.password ?? "");
    const confirm = String(body.confirm ?? "");

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Le code doit contenir 6 chiffres." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 },
      );
    }
    if (password !== confirm) {
      return NextResponse.json(
        { error: "Les mots de passe ne correspondent pas." },
        { status: 400 },
      );
    }

    const out = await resetPasswordWithCodeDetailed(email, code, password);
    if (out.kind === "too_many") {
      return rateLimited("Trop de tentatives. Réessayez plus tard.", out.retryAfterSec);
    }
    if (out.kind !== "ok") {
      const e = CODE_ERRORS[out.kind];
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }

    const token = await signSessionToken(out.user);
    const res = NextResponse.json({ ok: true, user: out.user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}