import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHmac, createHash, randomInt, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { db } from "db";
import { authAttempts, emailVerifications, passwordResets, users } from "db/schema";

/* ------------------------------------------------------------------ */
/*  I2 — Auth rate limiting core: DB-backed, multi-instance safe.      */
/*                                                                    */
/*  The clock used for EVERY threshold decision is the DATABASE's      */
/*  now(), never the process clock (avoids skew across instances).     */
/*  Counters live in `auth_attempts` ((scope, key) unique) and are     */
/*  incremented with atomic UPSERT — serialized row locks make          */
/*  concurrent increments exact (see the 100-requests test).           */
/*                                                                    */
/*  Fail-closed: any database error inside a decision path raises      */
/*  AuthLimiterError. Routes map it to 503 AUTH_CHECK_UNAVAILABLE —    */
/*  never to a permissive default.                                    */
/*                                                                    */
/*  Client IP: read ONLY when TRUST_PROXY_HEADERS=1 (documented in     */
/*  .env.example). When the header is untrusted/missing, IP-based      */
/*  limits are silently disabled — there is never a shared              */
/*  "unknown" key that would throttle every visitor at once.           */
/* ------------------------------------------------------------------ */

/** (b) Login thresholds. `email+ip` and `ip` are per-visitor; `email`
 *  is per-account and NEVER re-arms on success (only by its cooldown).
 *  The email+ip counter resets on a successful login. */
const LOGIN_EMAIL_IP_THRESHOLD = 5; // (1) par (email+IP)
const LOGIN_IP_THRESHOLD = 50; //       (2) par IP seule
const LOGIN_EMAIL_THRESHOLD = 25; //    (3) par email seul
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_EMAIL_IP_COOLDOWN_BASE_SEC = 15 * 60;
const LOGIN_EMAIL_IP_COOLDOWN_CAP_SEC = 24 * 3600;
const LOGIN_IP_LOCK_SEC = 60 * 60;
const LOGIN_EMAIL_LOCK_SEC = 5 * 60; // auto-rearm (étendu à chaque nouvel échec)

/** (e) Registrations: per-IP burst gate (only when the IP is trusted), so a
 *  single hostile visitor cannot mass-create accounts in a short window. */
const REGISTER_IP_THRESHOLD = 10; // par IP brute
const REGISTER_WINDOW_SEC = 15 * 60;
const REGISTER_IP_LOCK_SEC = 1 * 3600;

/** (c) Six-digit code: at most 5 attempts per code (shared between the
 *  forgot-password `check` and `reset` steps); the code row is DELETED on
 *  the 5th failure. Codes are stored hashed and compared in constant time. */
export const CODE_MAX_ATTEMPTS = 5;
const CODE_EXPIRY_MIN = 30;

/** (c) Dispatch quotas: min 60 s between two sends, max 5 codes/hour. */
const DISPATCH_GAP_SEC = 60;
const DISPATCH_MAX_PER_HOUR = 5;
const DISPATCH_WINDOW_SEC = 3600;

/** (c) Anti spray: max 20 failed code tries per email over 24 h (verify +
 *  reset combined), then a long cooldown. */
const CODE_FAIL_MAX_24H = 20;
const CODE_FAIL_WINDOW_SEC = 24 * 3600;
const CODE_FAIL_LOCK_SEC = 24 * 3600;

/** Opportunistic cleanup: rows older than a week are swept on entry. */
const ROW_TTL_SEC = 7 * 24 * 3600;

export const AUTH_SCOPES = {
  loginEmailIp: "login:email+ip",
  loginIp: "login:ip",
  loginEmail: "login:email",
  dispatchGap: "dispatch:gap",
  dispatchQuota: "dispatch:quota",
  codeFail: "code:fail",
  registerIp: "register:ip",
} as const;

export class AuthLimiterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthLimiterError";
  }
}

/* ---------------- Client IP (amendment 1) ---------------- */

/** Client IP — only trusted when the deployment explicitly opts in via
 *  TRUST_PROXY_HEADERS=1 (reverse proxy that overwrites the header).
 *  Returns null otherwise so IP-based limits are disabled, never a
 *  shared "unknown" key. */
export function clientIp(req: NextRequest): string | null {
  if (process.env.TRUST_PROXY_HEADERS !== "1") return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* ---------------- Codes (amendment 5) ---------------- */

/** Uniform 6-digit code with leading zeros — 1 000 000 possibilities
 *  (replaces the old randomInt(100000, 999999) that excluded zero-prefixed
 *  codes). The clear code exists ONLY long enough to be emailed; it is
 *  never stored and never logged. */
export function generateNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC-SHA256(code, key) with a per-(usage,userId) message domain. The key
 *  is derived from JWT_SECRET with a fixed salt; prefixes keep verify and
 *  reset codes in disjoint spaces even for the same user. */
export function codeHash(usage: "verify" | "reset", userId: number, code: string): string {
  const secret = process.env.JWT_SECRET ?? "";
  const key = createHash("sha256").update(`aperio:auth:code:v1:${secret}`).digest();
  const message = `${usage}:${userId}:${code}`;
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

/** Constant-time comparison on fixed-size buffers (64 hex chars) — no
 *  early return on length, no leaking information about the digest. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.alloc(64);
  const bb = Buffer.alloc(64);
  Buffer.from(a, "utf8").copy(ba);
  Buffer.from(b, "utf8").copy(bb);
  return timingSafeEqual(ba, bb);
}

/* ---------------- DB primitives ---------------- */

async function guarded<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new AuthLimiterError(`AuthLimiter database failure (${label})`, { cause });
  }
}

async function purgeExpiredRows(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM "auth_attempts" WHERE "updated_at" < now() - make_interval(secs => ${ROW_TTL_SEC})`);
  } catch {
    /* Purge is opportunistic — never let it break a decision. */
  }
}

/** Atomic upsert increment: the row's (scope, key) is unique; the increment
 *  and window-roll decision happen inside ONE statement so concurrent
 *  requests serialize on the row lock and never lose an attempt. */
async function bump(scope: string, key: string, windowSec: number): Promise<number> {
  const [row] = await guarded(`bump:${scope}`, () =>
    db
      .insert(authAttempts)
      .values({ scope, key, attempts: 1, windowStart: sql`now()`, lockedUntil: null })
      .onConflictDoUpdate({
        target: [authAttempts.scope, authAttempts.key],
        set: {
          attempts: sql`CASE WHEN ${authAttempts.windowStart} > now() - make_interval(secs => ${windowSec}) THEN ${authAttempts.attempts} + 1 ELSE 1 END`,
          windowStart: sql`CASE WHEN ${authAttempts.windowStart} > now() - make_interval(secs => ${windowSec}) THEN ${authAttempts.windowStart} ELSE now() END`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ attempts: authAttempts.attempts }),
  );
  return row?.attempts ?? 1;
}

/** Seconds until the row's lock expires, per the DB clock — 0 when the
 *  lock already passed, null when there is no lock. */
async function lockedSeconds(scope: string, key: string): Promise<number | null> {
  const res = await guarded(`locked:${scope}`, () =>
    db.execute(
      sql`SELECT floor(extract(epoch from ("locked_until" - now())))::int AS s
            FROM "auth_attempts" WHERE "scope" = ${scope} AND "key" = ${key} AND "locked_until" > now()`,
    ),
  );
  const rows = (res as unknown as { rows?: Array<{ s: string | number | null }> }).rows ?? [];
  const secs = rows[0]?.s ?? null;
  return secs === null ? null : Number(secs);
}

async function setLock(scope: string, key: string, durationSec: number, rearm: boolean): Promise<void> {
  await guarded(`setLock:${scope}`, () =>
    db
      .insert(authAttempts)
      .values({
        scope,
        key,
        attempts: 0,
        windowStart: sql`now()`,
        lockedUntil: sql`now() + make_interval(secs => ${durationSec})`,
      })
      .onConflictDoUpdate({
        target: [authAttempts.scope, authAttempts.key],
        set: {
          lockedUntil: rearm
            ? sql`now() + make_interval(secs => ${durationSec})`
            : sql`GREATEST(coalesce("auth_attempts"."locked_until", now()), now() + make_interval(secs => ${durationSec}))`,
          updatedAt: sql`now()`,
        },
      }),
  );
}

async function deleteRows(scope: string, keys: string[]): Promise<void> {
  for (const key of keys) {
    await guarded(`delete:${scope}`, () =>
      db
        .delete(authAttempts)
        .where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, key)))
        .execute(),
    );
  }
}

/* ---------------- Login (b) ---------------- */

export interface LoginCheckResult {
  allowed: boolean;
  reason: "email" | "email+ip" | "ip" | null;
  retryAfterSec: number | null;
}

/** Pre-login gate: allowed unless an account-IP / IP / email lock (per the
 *  DB clock) is active. Fail-closed on database errors. */
export async function checkLoginAllowed(emailInput: string, ip: string | null): Promise<LoginCheckResult> {
  await purgeExpiredRows();
  const email = normEmail(emailInput);
  const keys: Array<{ scope: string; key: string; reason: LoginCheckResult["reason"] }> = [
    { scope: AUTH_SCOPES.loginEmailIp, key: `${email}::${ip ?? ""}`, reason: "email+ip" as const },
    { scope: AUTH_SCOPES.loginIp, key: ip ?? "", reason: "ip" as const },
    { scope: AUTH_SCOPES.loginEmail, key: email, reason: "email" as const },
  ].filter((k) => (k.scope === AUTH_SCOPES.loginIp ? !!ip : true));

  for (const { scope, key, reason } of keys) {
    const secs = await lockedSeconds(scope, key);
    if (secs !== null && secs > 0) return { allowed: false, reason, retryAfterSec: secs };
  }
  return { allowed: true, reason: null, retryAfterSec: null };
}

/** Records one failed login: bumps (email+ip), (ip), and (email) counters,
 *  then applies the lock that the reached threshold dictates. */
export async function recordLoginFailure(emailInput: string, ip: string | null): Promise<void> {
  await purgeExpiredRows();
  const email = normEmail(emailInput);

  const ipLock = ip
    ? async () => {
        const attempts = await bump(AUTH_SCOPES.loginIp, ip, LOGIN_WINDOW_SEC);
        if (attempts >= LOGIN_IP_THRESHOLD) await setLock(AUTH_SCOPES.loginIp, ip, LOGIN_IP_LOCK_SEC, false);
      }
    : async () => {};
  const emailIpLock = ip
    ? async () => {
        const key = `${email}::${ip}`;
        const attempts = await bump(AUTH_SCOPES.loginEmailIp, key, LOGIN_WINDOW_SEC);
        if (attempts >= LOGIN_EMAIL_IP_THRESHOLD) {
          const excess = attempts - LOGIN_EMAIL_IP_THRESHOLD;
          const grow = Math.min(LOGIN_EMAIL_IP_COOLDOWN_BASE_SEC * 2 ** excess, LOGIN_EMAIL_IP_COOLDOWN_CAP_SEC);
          await setLock(AUTH_SCOPES.loginEmailIp, key, grow, false);
        }
      }
    : async () => {};
  const emailLock = async () => {
    const attempts = await bump(AUTH_SCOPES.loginEmail, email, LOGIN_WINDOW_SEC);
    if (attempts >= LOGIN_EMAIL_THRESHOLD) await setLock(AUTH_SCOPES.loginEmail, email, LOGIN_EMAIL_LOCK_SEC, true);
  };

  await Promise.all([ipLock(), emailIpLock(), emailLock()]);
}

/** On a successful login: the (email+ip) and (ip) counters reset (the
 *  per-account (email) counter deliberately does NOT — only its cooldown
 *  re-arms it). */
export async function recordLoginSuccess(emailInput: string, ip: string | null): Promise<void> {
  const email = normEmail(emailInput);
  const keys = ip ? [`${email}::${ip}`] : [];
  await deleteRows(AUTH_SCOPES.loginEmailIp, keys);
  if (ip) await deleteRows(AUTH_SCOPES.loginIp, [ip]);
}

/* ---------------- Register (e) ---------------- */

export interface RegisterCheckResult {
  allowed: boolean;
  retryAfterSec: number | null;
}

/** Registration gate, per trusted IP: at most 10 accounts / 15 min, then a
 *  1 h lock that re-arms on each further pressure. Never a shared key: with
 *  no trusted IP it is a no-op. Fail-closed on database errors. */
export async function assertAllowedRegister(ip: string | null): Promise<RegisterCheckResult> {
  await purgeExpiredRows();
  if (!ip) return { allowed: true, retryAfterSec: null };
  const attempts = await bump(AUTH_SCOPES.registerIp, ip, REGISTER_WINDOW_SEC);
  if (attempts >= REGISTER_IP_THRESHOLD) {
    await setLock(AUTH_SCOPES.registerIp, ip, REGISTER_IP_LOCK_SEC, true);
    const secs = await lockedSeconds(AUTH_SCOPES.registerIp, ip);
    return { allowed: false, retryAfterSec: secs };
  }
  return { allowed: true, retryAfterSec: null };
}

/* ---------------- Dispatch (c) ---------------- */

export interface DispatchResult {
  allowed: boolean;
  reason: "gap" | "quota" | null;
  retryAfterSec: number | null;
}

/** Rate-limited code emission: 60 s between two sends (per email, shared by
 *  verify and reset) and at most 5 codes/email/hour. Fail-closed: a DB error
 *  prevents dispatch (route → 503). */
export async function assertAllowedDispatch(emailInput: string): Promise<DispatchResult> {
  await purgeExpiredRows();
  const email = normEmail(emailInput);

  const gapSec = await lockedSeconds(AUTH_SCOPES.dispatchGap, email);
  if (gapSec !== null && gapSec > 0) return { allowed: false, reason: "gap", retryAfterSec: gapSec };

  const reqs = await bump(AUTH_SCOPES.dispatchQuota, email, DISPATCH_WINDOW_SEC);
  if (reqs > DISPATCH_MAX_PER_HOUR) {
    /* 6th+ emission of the hour — the quota row now has a lock until the
     *  window rolls so `lockedSeconds` reports the dealine. */
    await setLock(AUTH_SCOPES.dispatchQuota, email, DISPATCH_WINDOW_SEC, false);
    const untilWindowEnd = await lockedSeconds(AUTH_SCOPES.dispatchQuota, email);
    return { allowed: false, reason: "quota", retryAfterSec: untilWindowEnd ?? DISPATCH_WINDOW_SEC };
  }

  /* Allowed: rearm the 60 s gap lock and persist the quota count. */
  await setLock(AUTH_SCOPES.dispatchGap, email, DISPATCH_GAP_SEC, true);
  return { allowed: true, reason: null, retryAfterSec: null };
}

/* ---------------- Code verification (c / amendment 2) ---------------- */

export type CodeVerifyStatus =
  | "ok"
  | "invalid"
  | "invalidated"
  | "expired"
  | "too_many";

export interface CodeVerifyResult {
  status: CodeVerifyStatus;
  userId: number | null;
  attemptsConsumed: boolean;
  retryAfterSec: number | null;
}

type CodeTable = typeof emailVerifications | typeof passwordResets;

/**
 * Atomic code attempt gate, shared by verify / forgot-check / forgot-reset.
 *
 *  - The per-code `attempts` counter is incremented FIRST with
 *    UPDATE ... RETURNING (row lock); the comparison only happens when the
 *    incremented counter is <= 5.
 *  - On the 5th failure the code row is deleted → a fresh code is required.
 *  - `consumeOnSuccess=false` (the forgot "check" pre-step) keeps the row
 *    alive on success so the subsequent "reset" can consume it — the two
 *    steps share the same attempt budget.
 *  - A per-email 24 h cap (verify + reset combined) stops spraying.
 *  - Comparison is constant-time over hashed codes.
 */
export async function verifyCodeAttempt(
  kind: "verify" | "reset",
  emailInput: string,
  code: string,
  opts: { consumeOnSuccess: boolean },
): Promise<CodeVerifyResult> {
  /* Amendment 2: an entry that is not exactly 6 digits is refused WITHOUT
   * consuming a per-code attempt and without touching the counters. */
  if (!/^\d{6}$/.test(code)) {
    return { status: "invalid", userId: null, attemptsConsumed: false, retryAfterSec: null };
  }
  await purgeExpiredRows();
  const email = normEmail(emailInput);
  const table: CodeTable = kind === "verify" ? emailVerifications : passwordResets;

  /* Per-email 24 h cap first (does not burn a per-code attempt). */
  const capSecs = await lockedSeconds(AUTH_SCOPES.codeFail, email);
  if (capSecs !== null && capSecs > 0) {
    return { status: "too_many", userId: null, attemptsConsumed: false, retryAfterSec: capSecs };
  }

  const userRow = await guarded(`code:user:${kind}`, () =>
    db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
  );
  const userId = userRow[0]?.id;
  if (userId == null) return { status: "invalid", userId: null, attemptsConsumed: false, retryAfterSec: null };

  /* Atomic: increment BEFORE comparing; the row lock serializes concurrent
   * attempts (100 parallel requests → at most 5 comparisons). */
  const [attemptRow] = await guarded(`code:bump:${kind}`, () =>
    db
      .update(table)
      .set({ attempts: sql`${table.attempts} + 1` })
      .where(eq(table.userId, userId))
      .returning({ attempts: table.attempts, codeHash: table.codeHash, expiresAt: table.expiresAt }),
  );
  if (!attemptRow) return { status: "invalid", userId: null, attemptsConsumed: false, retryAfterSec: null };

  if (attemptRow.attempts > CODE_MAX_ATTEMPTS) {
    /* Budget épuisé : la ligne est écartée sans comparaison aucune — aucune
     * information sur le code ; attemptsConsumed reste false (rien d'autre
     * ne peut être consommé) pour que « comparaisons » = tentatives réelles. */
    await guarded(`code:invalidate:${kind}`, () => db.delete(table).where(eq(table.userId, userId)).execute());
    return { status: "invalidated", userId, attemptsConsumed: false, retryAfterSec: null };
  }

  const match = constantTimeEqual(attemptRow.codeHash, codeHash(kind, userId, code));

  if (match) {
    const res = await guarded(`code:expiry:${kind}`, () =>
      db.execute(
        sql`SELECT (${table.expiresAt} > now()) AS ok FROM ${table} WHERE ${table.userId} = ${userId}`,
      ),
    );
    const okRow = (res as unknown as { rows?: Array<{ ok: boolean | null }> }).rows?.[0];
    if (okRow?.ok === true) {
      if (opts.consumeOnSuccess) {
        await guarded(`code:consume:${kind}`, () => db.delete(table).where(eq(table.userId, userId)).execute());
      }
      return { status: "ok", userId, attemptsConsumed: true, retryAfterSec: null };
    }
    /* Valid code but expired — free the slot, the user must request a new one. */
    await guarded(`code:expire:${kind}`, () => db.delete(table).where(eq(table.userId, userId)).execute());
    return { status: "expired", userId, attemptsConsumed: true, retryAfterSec: null };
  }

  /* Wrong code: shared per-email fail counter (verify + reset combined). */
  const fails = await bump(AUTH_SCOPES.codeFail, email, CODE_FAIL_WINDOW_SEC);
  if (fails > CODE_FAIL_MAX_24H) {
    await setLock(AUTH_SCOPES.codeFail, email, CODE_FAIL_LOCK_SEC, true);
  }
  /* Amendment 2: on the 5th failed comparison the code is burned (deleted),
   * making the NEXT attempt impossible even with the right code. */
  if (attemptRow.attempts >= CODE_MAX_ATTEMPTS) {
    await guarded(`code:burn:${kind}`, () => db.delete(table).where(eq(table.userId, userId)).execute());
  }
  return { status: "invalid", userId, attemptsConsumed: true, retryAfterSec: null };
}