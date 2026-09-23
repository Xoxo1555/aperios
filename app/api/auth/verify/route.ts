import { NextRequest, NextResponse } from "next/server";
import { db } from "db";
import { users } from "db/schema";
import { eq } from "drizzle-orm";
import { MailDeliveryError } from "lib/mailer";
import { guardedAuth, rateLimited } from "lib/auth-http";
import { assertAllowedDispatch } from "lib/auth-attempts";
import {
  SESSION_COOKIE,
  dispatchEmailVerification,
  signSessionToken,
  verifyEmailCodeDetailed,
} from "lib/auth";

export const dynamic = "force-dynamic";

const CODE_ERRORS: Record<"invalid" | "expired" | "invalidated", { code: string; message: string }> = {
  invalid: { code: "CODE_INVALID", message: "Code invalide ou expiré. Demandez un nouveau code." },
  expired: { code: "CODE_EXPIRED", message: "Ce code a expiré. Demandez un nouveau code." },
  invalidated: {
    code: "CODE_INVALIDATED",
    message: "Trop de tentatives pour ce code. Demandez un nouveau code.",
  },
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email requis." }, { status: 400 });
  }

  /* ---------------- Verify code ---------------- */
  if (action === "verify") {
    const code = String(body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Le code doit contenir 6 chiffres." }, { status: 400 });
    }
    const out = await verifyEmailCodeDetailed(email, code);
    if (out.kind === "too_many") {
      return rateLimited("Trop de tentatives. Réessayez plus tard.", out.retryAfterSec);
    }
    if (out.kind !== "ok") {
      const e = CODE_ERRORS[out.kind];
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    const token = await signSessionToken(out.user);
    const res = NextResponse.json({ user: out.user, ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  }

  /* ---------------- Resend code ---------------- */
  if (action === "resend") {
    /* (c) Dispatch quota FIRST (gap 60 s, max 5 codes/h): protects the
     * accounts lookup and the SMTP call alike. */
    const resendGate = await guardedAuth(() => assertAllowedDispatch(email));
    if (resendGate instanceof NextResponse) return resendGate;
    if (!resendGate.allowed) {
      return rateLimited(
        "Veuillez patienter avant de demander un nouveau code.",
        resendGate.retryAfterSec,
      );
    }

    const row = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
    if (!row[0]) {
      /* Neutral response (anti-énumération) : on ne dévoile pas si l'e-mail
       * est inscrit — aucun code n'est émis pour un e-mail inconnu. */
      return NextResponse.json({
        ok: true,
        message: "Un nouveau code de validation a été envoyé à votre adresse email.",
      });
    }
    try {
      await dispatchEmailVerification(row[0].id, email, row[0].name);
    } catch (err) {
      if (err instanceof MailDeliveryError) {
        return NextResponse.json(
          { error: `Impossible d'envoyer le code de confirmation : ${err.message}` },
          { status: 500 },
        );
      }
      throw err;
    }
    return NextResponse.json({
      ok: true,
      message: "Un nouveau code de validation a été envoyé à votre adresse email.",
    });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}