import "server-only";
import { NextResponse } from "next/server";
import { AuthLimiterError } from "./auth-attempts";

/* ------------------------------------------------------------------ */
/*  I2 — HTTP shapers shared by the auth routes (login, verify,        */
/*  forgot-password). Stable machine codes are part of every response:  */
/*   • 429  RATE_LIMITED              — Retry-After header + seconds    */
/*   • 503  AUTH_CHECK_UNAVAILABLE    — fail-closed (AuthLimiterError)  */
/*   • 400  CODE_INVALID / CODE_EXPIRED / CODE_INVALIDATED (per route)  */
/*   • 401  INVALID_CREDENTIALS / 409 EMAIL_TAKEN (per route)           */
/* ------------------------------------------------------------------ */

export function rateLimited(message: string, retryAfterSec: number | null): NextResponse {
  const res = NextResponse.json(
    { error: message, code: "RATE_LIMITED", retryAfterSec },
    { status: 429 },
  );
  if (retryAfterSec !== null) {
    res.headers.set("retry-after", String(Math.max(1, Math.round(retryAfterSec))));
  }
  return res;
}

export function authUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error: "Le service d'authentification est momentanément indisponible. Réessayez plus tard.",
      code: "AUTH_CHECK_UNAVAILABLE",
    },
    { status: 503 },
  );
}

/** Wraps any limiter call: a database failure inside a decision path maps to
 *  503 (fail-closed), everything else is re-thrown for the outer error path. */
export async function guardedAuth<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthLimiterError) return authUnavailable();
    throw err;
  }
}