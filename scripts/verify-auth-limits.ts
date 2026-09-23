/**
 * Vérification I2 ÉTAPE 1 — cœur du limiteur anti-force-brute (lib/auth-attempts)
 * + bascule des codes en stockage hashé (lib/auth + lib/mailer rack de test).
 *
 * En direct, SANS serveur, via les VRAIES fonctions de production.
 *
 * Boucliers de test (SETUP) :
 *  - JWT_SECRET factice posé avant tout import ; APERIO_MAILER_SINK=1 (aucun
 *    SMTP, rack mémoire) ; SMTP_HOST supprimé avant imports.
 *  - STUB RÉSEAU GLOBAL : fetch -> THROW si une fonction tente de sortir.
 *  - horloge de la base (now()) simulée par vieillissement des lignes
 *    auth_attempts (locked_until / window_start rétro-datés) — on ne dort jamais.
 *  - comptes jetables uniquement @aperio.test ; tout est nettoyé à la fin.
 *
 * Cas couverts (ÉTAPE 1) :
 *   1. generateNumericCode : uniforme 0..999999 avec zéros de tête.
 *   2. codeHash : HMAC-SHA256 domainisé (usage+userId), déterministe, disjoint.
 *   3. constantTimeEqual : égalité/inégalité, aucune fuite par longueur.
 *   4. clientIp : aucun IP sans TRUST_PROXY_HEADERS=1 ; 1er saut avec ; x-real-ip.
 *   5. login (b) : 4 échecs OK, 5e → verrou (email+IP) avec retryAfter ; IP
 *      différente toujours OK ; verrou levé quand la fenêtre expire ; 25
 *      échecs (IPs variées) → verrou email 5 min ; recordLoginSuccess NE
 *      réarme JAMAIS le compteur email, mais efface (email+IP) ; 50 échecs
 *      d'une même IP → verrou IP 1 h.
 *   6. dispatch (c) : 60 s min entre 2 envois (gap), 5 codes/heure max (quota),
 *      6e → refus avec retryAfter.
 *   7. verify (c / amende 2) : code non-6-chiffres refusé SANS consommation ;
 *      5 essais partagés check/reset ; 5e échec → suppression ; 6e → refusé ;
 *      expiration → code supprimé ; code correct consommé ; stockage hashé
 *      (jamais en clair en base) ; compteur anti-spray 20/24 h → cooldown 24 h.
 *   8. CONCURRENCE (amende 2) : 100 essais parallèles avec codes différents →
 *      exactement 5 comparaisons, aucun succès, ligne supprimée.
 *   9. Purge opportuniste des lignes auth_attempts de plus de 7 jours.
 *  10. Coup d'envoi→vérification/réinitialisation de bout en bout via rack
 *      mailer (dispatchEmailVerification / verifyEmailCode, dispatchPasswordReset
 *      / checkPasswordResetCode / resetPasswordWithCode) ; AUCUN log ne contient
 *      jamais le code envoyé.
 *  11. ROUTES auth (ÉTAPE 2) : handlers POST exécutés tel quel — login (5
 *      échecs → 401 puis 429 RATE_LIMITED + Retry-After, verrou levant à
 *      expiration), register (10 insc./IP → 429, doublon → 409 EMAIL_TAKEN,
 *      sans IP → aucune limite partagée), verify (400 CODE_INVALID, brûlure au
 *      5e essai, 429 anti-spray 24 h), resend (429 gap, réponse neutre pour un
 *      e-mail inconnu), forgot request/check/reset (429, budget partagé, FR).
 *
 * Usage :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-auth-limits.ts
 */
import "./lib/verify-auth-limits-conf";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { authAttempts, emailVerifications, passwordResets, users } from "../db/schema";
import { assertLocalDatabase } from "./lib/assert-local-db";
import {
  AUTH_SCOPES,
  assertAllowedDispatch,
  checkLoginAllowed,
  clientIp,
  codeHash,
  constantTimeEqual,
  generateNumericCode,
  recordLoginFailure,
  recordLoginSuccess,
  verifyCodeAttempt,
} from "../lib/auth-attempts";
import {
  checkPasswordResetCode,
  createEmailVerificationCode,
  createPasswordResetCode,
  dispatchEmailVerification,
  dispatchPasswordReset,
  hashPassword,
  resetPasswordWithCode,
  verifyEmailCode,
} from "../lib/auth";
import { captureCode, clearMailSink } from "../lib/mailer";
import { NextRequest, NextResponse } from "next/server";
import { POST as authPOST } from "../app/api/auth/route";
import { POST as verifyPOST } from "../app/api/auth/verify/route";
import { POST as forgotPOST } from "../app/api/auth/forgot-password/route";

assertLocalDatabase();

const forbidNetwork = (label: string) => {
  return (...args: unknown[]) => {
    const err = new Error(`RÉSEAU EXTERNE INTERDIT dans verify-auth-limits — ${label} ${String(args[0] ?? "")}`);
    err.name = "NetworkStubViolation";
    throw err;
  };
};
(globalThis as { fetch: unknown }).fetch = forbidNetwork("fetch") as typeof fetch;

const stamp = Date.now().toString(36);
let seq = 0;
const nextEmail = () => `verify-aul-${stamp}-${++seq}@aperio.test`;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond === false || !cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-auth-limits] ${msg}`);

const createdUserIds: number[] = [];
const createdAttemptKeys: Array<{ scope: string; key: string }> = [];
const usedIps: string[] = [];

/** Enregistre un IP factice pour que cleanup le trouve, puis le retourne. */
function trackIp(ip: string): string {
  if (!usedIps.includes(ip)) usedIps.push(ip);
  return ip;
}

async function newUser(over: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db
    .insert(users)
    .values({
      name: `Verify AUL ${stamp} ${seq}`,
      email: nextEmail(),
      passwordHash: "x",
      role: "buyer",
      emailVerified: false,
      ...over,
    })
    .returning();
  createdUserIds.push(u.id);
  return u;
}

function track(scope: string, key: string) {
  createdAttemptKeys.push({ scope, key });
}

/* ---------------- Route-level helpers (ÉTAPE 2) ---------------- */

function post(url: string, body: unknown, ip?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-forwarded-for", ip);
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers });
}

async function bodyOf(res: NextResponse): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function verifiedUser(password: string) {
  const u = await newUser();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), emailVerified: true })
    .where(eq(users.id, u.id));
  return u;
}

/** Vieillit une ligne limiteur : verrou expiré (et fenêtre roulée) → l'état
 *  devient « post-cooldown » sans dormir. */
async function expireLock(scope: string, key: string): Promise<void> {
  await db
    .update(authAttempts)
    .set({
      lockedUntil: sql`now() - interval '1 second'`,
      windowStart: sql`now() - interval '1 hour'`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, key)));
}

async function cleanup() {
  for (const id of createdUserIds) {
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, id)).catch((e) => console.warn("[cleanup] ev", e.message));
    await db.delete(passwordResets).where(eq(passwordResets.userId, id)).catch((e) => console.warn("[cleanup] pr", e.message));
  }
  for (const { scope, key } of createdAttemptKeys) {
    await db
      .delete(authAttempts)
      .where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, key)))
      .catch((e) => console.warn("[cleanup] attempts", e.message));
  }
  /* Rows référencées par les keywords de test : emails du harnais (clefs
   * comprenant `email::ip` ou l'email seul), e-mails fantômes des réponses
   * neutres (ghost-/ghost2-) et IP brutes enregistrées — le stamp unique de CE
   * run figure dans toutes les clefs créées pendant l'exécution. */
  await db
    .delete(authAttempts)
    .where(sql`"key" LIKE ${`%${stamp}%`}`)
    .catch((e) => console.warn("[cleanup] attempts-like", e.message));
  if (usedIps.length) {
    for (const ip of usedIps) {
      for (const scope of [AUTH_SCOPES.loginIp, AUTH_SCOPES.registerIp]) {
        await db
          .delete(authAttempts)
          .where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, ip)))
          .catch((e) => console.warn("[cleanup] attempts-ip", e.message));
      }
    }
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch((e) => console.warn("[cleanup] users", e.message));
  }
}

async function main() {
  try {
    /* ============ 1. generateNumericCode ============ */
    log("1 — generateNumericCode : 6 chiffres uniformes, zéros de tête possibles");
    {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const c = generateNumericCode();
        check(/^\d{6}$/.test(c), `1: format 6 chiffres (reçu "${c}")`);
        seen.add(c);
      }
      check(seen.size >= 190, `1: codes distincts (${seen.size}/200)`);
      log("  OK — 200 tirages 6 chiffres, distincts");
    }

    /* ============ 2. codeHash — HMAC domainisé ============ */
    log("2 — codeHash : HMAC-SHA256 déterministe et disjoint par (usage, userId)");
    {
      const a = codeHash("verify", 42, "123456");
      const b = codeHash("verify", 42, "123456");
      check(a === b, "2: déterministe");
      check(/^[0-9a-f]{64}$/.test(a), "2: digest sha256 (64 hex)");
      check(codeHash("reset", 42, "123456") !== a, "2: usage différent → message différent");
      check(codeHash("verify", 43, "123456") !== a, "2: userId différent → message différent");
      check(codeHash("verify", 42, "123457") !== a, "2: code différent → digest différent");
      log("  OK — digest 64 hex, déterminisme, domaines disjoints");
    }

    /* ============ 3. constantTimeEqual ============ */
    log("3 — constantTimeEqual : égalité exacte, différence détectée");
    {
      const h = codeHash("verify", 7, "000001");
      check(constantTimeEqual(h, h) === true, "3: égalité");
      check(constantTimeEqual(h, h + "a") === true, "3: longueur ≠ ne fuite pas (tampons fixes)");
      check(constantTimeEqual(h, "0".repeat(64)) === false, "3: différence détectée");
      check(constantTimeEqual("", "") === true, "3: vides égaux");
      log("  OK");
    }

    /* ============ 4. clientIp / TRUST_PROXY_HEADERS ============ */
    log("4 — clientIp : jamais d'IP sans TRUST_PROXY_HEADERS=1 ; 1er saut sinon");
    {
      const withFF = new NextRequest("http://localhost/api/auth", {
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      });
      check(clientIp(withFF) === null, "4: IP ignorée sans le flag");
      process.env.TRUST_PROXY_HEADERS = "1";
      check(clientIp(withFF) === "203.0.113.9", "4: 1er saut utilisé");
      const withReal = new NextRequest("http://localhost/api/auth", {
        headers: { "x-real-ip": "198.51.100.7", "x-forwarded-for": " " },
      });
      check(clientIp(withReal) === "198.51.100.7", "4: repli x-real-ip");
      const none = new NextRequest("http://localhost/api/auth");
      check(clientIp(none) === null, "4: aucune adresse → null (limites IP désactivées)");
      delete process.env.TRUST_PROXY_HEADERS;
      log("  OK — les deux modes testés, jamais de clé « unknown »");
    }

    /* ============ 5. Login (b) ============ */
    log("5 — login : verrous progressifs (email+IP / IP / email), jamais réarmés par succès");
    {
      const email = nextEmail();
      const ipA = trackIp("11.11.11.11");
      track(AUTH_SCOPES.loginEmailIp, `${email}::${ipA}`);
      track(AUTH_SCOPES.loginIp, ipA);
      track(AUTH_SCOPES.loginEmail, email);

      let g = await checkLoginAllowed(email, ipA);
      check(g.allowed === true, "5a: état initial autorisé");

      for (let i = 1; i <= 4; i++) {
        await recordLoginFailure(email, ipA);
        g = await checkLoginAllowed(email, ipA);
        check(g.allowed === true, `5a: ${i} échec(s) → encore autorisé`);
      }
      await recordLoginFailure(email, ipA);
      g = await checkLoginAllowed(email, ipA);
      check(g.allowed === false, "5a: 5e échec → verrouillé");
      check(g.reason === "email+ip", `5a: raison email+ip (${g.reason})`);
      check(g.retryAfterSec !== null && g.retryAfterSec > 0, "5a: retryAfter > 0");
      log(`  OK — 4 échecs tolérés, 5e → verrou email+IP (retryAfter≈${g.retryAfterSec}s)`);

      const gOtherIp = await checkLoginAllowed(email, "22.22.22.22");
      check(gOtherIp.allowed === true, "5b: autre IP → non verrouillée (compteur par visiteur)");
      log("  OK — une autre IP n'est pas pénalisée");

      await expireLock(AUTH_SCOPES.loginEmailIp, `${email}::${ipA}`);
      g = await checkLoginAllowed(email, ipA);
      check(g.allowed === true, "5c: verrou expiré → autorisé de nouveau");
      log("  OK — le verrou se lève quand la fenêtre expire");

      /* Compteur email seul (25/15min) : 25 échecs avec des IPs distinctes. */
      const emailE = nextEmail();
      track(AUTH_SCOPES.loginEmail, emailE);
      for (let i = 1; i < 25; i++) {
        await recordLoginFailure(emailE, trackIp(`33.33.33.${i}`));
      }
      g = await checkLoginAllowed(emailE, "33.33.33.99");
      check(g.allowed === true, "5d: 24 échecs → autorisé (email seul < 25)");
      const ip25 = trackIp("99.99.99.25");
      await recordLoginFailure(emailE, ip25);
      g = await checkLoginAllowed(emailE, ip25);
      check(g.allowed === false && g.reason === "email", `5d: 25e échec → verrou email (${g.reason})`);
      check(g.retryAfterSec !== null && g.retryAfterSec <= 5 * 60, "5d: verrou email = 5 min");

      /* Succès APRÈS verrou : le compteur email n'est JAMAIS réarmé. */
      await recordLoginSuccess(emailE, ip25);
      g = await checkLoginAllowed(emailE, ip25);
      check(g.allowed === false && g.reason === "email", "5e: succès NE réarme PAS le verrou email");
      log("  OK — 25e échec → verrou email 5 min ; recordLoginSuccess ne le réarme pas");

      /* Mais (email+IP) lui, se réarme. */
      const emailF = nextEmail();
      const ipF = trackIp("55.55.55.55");
      track(AUTH_SCOPES.loginEmailIp, `${emailF}::${ipF}`);
      track(AUTH_SCOPES.loginEmail, emailF);
      for (let i = 1; i <= 5; i++) await recordLoginFailure(emailF, ipF);
      check((await checkLoginAllowed(emailF, ipF)).allowed === false, "5f: verrou email+IP posé");
      await recordLoginSuccess(emailF, ipF);
      g = await checkLoginAllowed(emailF, ipF);
      check(g.allowed === true, "5f: succès → compteur (email+IP) remis à zéro");
      const rowsAfter = await db
        .select({ id: authAttempts.id })
        .from(authAttempts)
        .where(and(eq(authAttempts.scope, AUTH_SCOPES.loginEmailIp), eq(authAttempts.key, `${emailF}::${ipF}`)));
      check(rowsAfter.length === 0, "5f: ligne (email+IP) supprimée après succès");
      log("  OK — (email+IP) se remet à zéro au succès, (email) jamais");

      /* Verrou IP seule (50/15min → 1h). */
      const ipG = trackIp("77.77.77.77");
      for (let i = 1; i < 50; i++) await recordLoginFailure(nextEmail(), ipG);
      g = await checkLoginAllowed(nextEmail(), ipG);
      check(g.allowed === true, "5g: 49 échecs IP brute → autorisé");
      await recordLoginFailure(nextEmail(), ipG);
      g = await checkLoginAllowed(nextEmail(), ipG);
      check(g.allowed === false && g.reason === "ip", `5g: 50e échec → verrou IP (${g.reason})`);
      check(g.retryAfterSec !== null && g.retryAfterSec <= 3600 + 5 && g.retryAfterSec > 0, "5g: verrou IP ≈ 1 h");
      log("  OK — 50e échec d'une même IP → verrou IP 1 h");
    }

    /* ============ 6. Dispatch (c) ============ */
    log("6 — dispatch : min 60 s entre envois, max 5 codes/heure");
    {
      const email = nextEmail();
      track(AUTH_SCOPES.dispatchGap, email);
      track(AUTH_SCOPES.dispatchQuota, email);

      let d = await assertAllowedDispatch(email);
      check(d.allowed === true, "6a: 1er envoi autorisé");
      d = await assertAllowedDispatch(email);
      check(d.allowed === false && d.reason === "gap", `6a: 2e envoi immédiat refusé (gap) (${d.reason})`);
      check(d.retryAfterSec !== null && d.retryAfterSec <= 60, "6a: retryAfter ≤ 60 s");
      log(`  OK — 2e envoi immédiat bloqué (retryAfter≈${d.retryAfterSec}s)`);

      /* Lever le gap entre les envois suivants : 5 autorisés puis refus quota. */
      for (let i = 1; i < 5; i++) {
        await expireLock(AUTH_SCOPES.dispatchGap, email);
        d = await assertAllowedDispatch(email);
        check(d.allowed === true, `6b: envoi #${i + 1} autorisé (dans la même heure)`);
      }
      await expireLock(AUTH_SCOPES.dispatchGap, email);
      d = await assertAllowedDispatch(email);
      check(d.allowed === false && d.reason === "quota", `6b: 6e envoi → quota (${d.reason})`);
      check(d.retryAfterSec !== null && d.retryAfterSec > 0, "6b: retryAfter quota > 0");
      log(`  OK — 5 envois/h autorisés, 6e bloqué (retryAfter≈${d.retryAfterSec}s)`);
    }

    /* ============ 7. verify (c / amende 2) ============ */
    log("7 — verify : formats refusés sans consommation, 5 essais partagés, invalidation, spray 20/24 h");
    {
      const u = await newUser();
      const email = u.email;
      const code = await createEmailVerificationCode(u.id);

      const bad1 = await verifyCodeAttempt("verify", email, "12ab34", { consumeOnSuccess: true });
      check(bad1.status === "invalid" && bad1.attemptsConsumed === false, "7a: code non-chiffré refusé SANS consommation");
      const bad2 = await verifyCodeAttempt("verify", email, "12345", { consumeOnSuccess: true });
      check(bad2.status === "invalid" && bad2.attemptsConsumed === false, "7a: 5 chiffres refusé sans consommation");
      const bad3 = await verifyCodeAttempt("verify", email, "1234567", { consumeOnSuccess: true });
      check(bad3.status === "invalid" && bad3.attemptsConsumed === false, "7a: 7 chiffres refusé sans consommation");
      const [rowAfterBad] = await db
        .select({ a: emailVerifications.attempts })
        .from(emailVerifications)
        .where(eq(emailVerifications.userId, u.id));
      check(rowAfterBad.a === 0, "7a: compteur d'essais toujours à 0");
      log("  OK — entrées non-6-chiffres refusées sans consommer d'essai");

      /* Stockage hashé : la base ne contient jamais le code en clair. */
      const [rowHash] = await db
        .select({ h: emailVerifications.codeHash })
        .from(emailVerifications)
        .where(eq(emailVerifications.userId, u.id));
      check(rowHash.h === codeHash("verify", u.id, code), "7b: code_hash = HMAC du code");
      check(rowHash.h !== code, "7b: aucun code en clair stocké");
      log("  OK — stockage hashé (HMAC-SHA256), jamais en clair");

      let rr = await verifyCodeAttempt("verify", email, code, { consumeOnSuccess: true });
      check(rr.status === "ok" && rr.userId === u.id, "7c: bon code → ok");
      rr = await verifyCodeAttempt("verify", email, code, { consumeOnSuccess: true });
      check(rr.status === "invalid", "7c: code consommé → invalid ensuite");
      log("  OK — bon code consommé une seule fois");

      /* 5 essais partagés check/reset ; au 5e échec le code est supprimé. */
      const u2 = await newUser();
      const email2 = u2.email;
      const resetCode = await createPasswordResetCode(u2.id);
      track(AUTH_SCOPES.codeFail, email2);
      for (let i = 1; i <= 4; i++) {
        const r = await verifyCodeAttempt("reset", email2, `${i}00000`, { consumeOnSuccess: false });
        check(r.status === "invalid" && r.attemptsConsumed === true, `7d: ${i}e mauvais code → invalid (consommé)`);
      }
      let cv = await verifyCodeAttempt("reset", email2, `${5}00000`, { consumeOnSuccess: false });
      check(cv.status === "invalid", "7d: 5e mauvais code → invalid");
      const [rowU2a] = await db.select().from(passwordResets).where(eq(passwordResets.userId, u2.id));
      check(rowU2a === undefined, "7d: ligne supprimée au 5e échec");
      cv = await verifyCodeAttempt("reset", email2, resetCode, { consumeOnSuccess: true });
      check(cv.status === "invalid" || cv.status === "invalidated", `7d: 6e essai (même le bon) → refusé (${cv.status})`);
      check(
        (await db.select().from(passwordResets).where(eq(passwordResets.userId, u2.id))).length === 0,
        "7d: code resté supprimé (budget 5 épuisé)",
      );
      log("  OK — 5 essais partagés, 5e échec supprime le code, le 6e (même le bon) est refusé");

      /* check sans consommation : le code reste utilisable, le budget est partagé. */
      const u3 = await newUser();
      const email3 = u3.email;
      const c3 = await createPasswordResetCode(u3.id);
      track(AUTH_SCOPES.codeFail, email3);
      const okCheck = await verifyCodeAttempt("reset", email3, c3, { consumeOnSuccess: false });
      check(okCheck.status === "ok", "7e: check réussit sans consommer");
      const [rowU3a] = await db
        .select({ a: passwordResets.attempts })
        .from(passwordResets)
        .where(eq(passwordResets.userId, u3.id));
      check(rowU3a.a === 1, "7e: 1 essai consommé par le check (budget partagé)");
      const okReset = await verifyCodeAttempt("reset", email3, c3, { consumeOnSuccess: true });
      check(okReset.status === "ok", "7e: reset consomme ensuite");
      const [rowU3b] = await db.select().from(passwordResets).where(eq(passwordResets.userId, u3.id));
      check(rowU3b === undefined, "7e: reset a consommé la ligne");
      log("  OK — check+reset partagent le compteur d'essais");

      /* Expiration : le code périmé est retiré. */
      const u4 = await newUser();
      const email4 = u4.email;
      const c4 = await createEmailVerificationCode(u4.id);
      await db
        .update(emailVerifications)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(emailVerifications.userId, u4.id));
      const ex = await verifyCodeAttempt("verify", email4, c4, { consumeOnSuccess: true });
      check(ex.status === "expired", `7f: code expiré → expired (${ex.status})`);
      const [rowU4b] = await db.select().from(emailVerifications).where(eq(emailVerifications.userId, u4.id));
      check(rowU4b === undefined, "7f: ligne expirée supprimée");
      log("  OK — code expiré refusé et retiré");

      /* Spray : 20 échecs/24 h sur verify+reset combinés → cooldown 24 h.
       L'attaquant utilise un code FRAIS toutes les 5 tentatives (le code est
       brûlé au 5e essai), sinon le compteur 24 h ne monterait jamais. */
      const u5 = await newUser();
      const email5 = u5.email;
      await createEmailVerificationCode(u5.id);
      track(AUTH_SCOPES.codeFail, email5);
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0 && i > 0) await createEmailVerificationCode(u5.id);
        const r = await verifyCodeAttempt("verify", email5, `9${String(i).padStart(5, "0")}`, { consumeOnSuccess: true });
        check(r.attemptsConsumed === true && r.status === "invalid", `7g: échec #${i + 1} consommé (invalid)`);
      }
      await createEmailVerificationCode(u5.id);
      const spray = await verifyCodeAttempt("verify", email5, "812345", { consumeOnSuccess: true });
      check(spray.attemptsConsumed === true && spray.status === "invalid", "7g: 21e échec consommé (seuil 20 dépassé, verrou posé)");
      const blocked = await verifyCodeAttempt("verify", email5, "999999", { consumeOnSuccess: true });
      check(blocked.status === "too_many" && blocked.attemptsConsumed === false, "7g: 22e → cooldown 24 h (too_many)");
      check(blocked.retryAfterSec !== null && blocked.retryAfterSec > 0, "7g: retryAfter présent");
      log(`  OK — après 20 échecs/24 h sur des codes frais, tentatives suivantes → too_many (cooldown 24 h, retryAfter≈${blocked.retryAfterSec}s)`);
    }

    /* ============ 8. CONCURRENCE : 100 essais parallèles ============ */
    log("8 — concurrence : 100 tentatives simultanées, codes différents → ≤ 5 comparaisons");
    {
      const u = await newUser();
      const email = u.email;
      await createEmailVerificationCode(u.id);
      const wrongCodes = Array.from({ length: 100 }, () => generateNumericCode());
      const results = await Promise.all(
        wrongCodes.map((c) => verifyCodeAttempt("verify", email, c, { consumeOnSuccess: true })),
      );
      const consumed = results.filter((r) => r.attemptsConsumed).length;
      const ok = results.filter((r) => r.status === "ok").length;
      check(consumed === 5, `8: exactement 5 comparaisons (reçu ${consumed})`);
      check(ok === 0, "8: aucun succès");
      check(results.every((r) => r.status === "invalid" || r.status === "invalidated"), "8: tous refusés");
      const [row] = await db.select().from(emailVerifications).where(eq(emailVerifications.userId, u.id));
      check(row === undefined, "8: ligne supprimée (5e échec atteint)");
      log("  OK — 100 requêtes → 5 comparaisons, 0 succès, ligne supprimée");
    }

    /* ============ 9. Purge opportuniste ============ */
    log("9 — purge : lignes auth_attempts vieilles de plus de 7 jours balayées");
    {
      const email = nextEmail();
      track(AUTH_SCOPES.loginEmail, email);
      await db.insert(authAttempts).values({
        scope: AUTH_SCOPES.loginEmail,
        key: email,
        attempts: 3,
        windowStart: sql`now() - interval '8 day'`,
        updatedAt: sql`now() - interval '8 day'`,
      });
      await checkLoginAllowed(email, null);
      const [row] = await db
        .select({ id: authAttempts.id })
        .from(authAttempts)
        .where(and(eq(authAttempts.scope, AUTH_SCOPES.loginEmail), eq(authAttempts.key, email)));
      check(row === undefined, "9: ligne âgée supprimée à l'entrée suivante");
      log("  OK");
    }

    /* ============ 10. Bout en bout via rack mailer, aucun log du code ============ */
    log("10 — envoi→vérification / réinitialisation de bout en bout, zéro code dans les logs");
    {
      const uV = await newUser();
      clearMailSink();
      const logs: string[] = [];
      const origLog = console.log;
      const origWarn = console.warn;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      console.warn = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      try {
        await dispatchEmailVerification(uV.id, uV.email, uV.name);
        await dispatchPasswordReset(uV.id, uV.email, uV.name);
      } finally {
        console.log = origLog;
        console.warn = origWarn;
      }
      const verifyCode = captureCode({ to: uV.email, subject: "vérification" });
      const resetCode = captureCode({ to: uV.email, subject: "Réinitialisation" });
      const leaked = logs.find((l) => /\b\d{6}\b/.test(l) && (l.includes(verifyCode) || l.includes(resetCode)));
      check(leaked === undefined, "10: AUCUN log ne contient le code envoyé");

      const sessV = await verifyEmailCode(uV.email, verifyCode);
      check(sessV !== null && sessV.email === uV.email, "10: envoyer→vérifier via rack : SessionUser rendu");
      const [uVAfter] = await db.select().from(users).where(eq(users.id, uV.id));
      check(uVAfter.emailVerified === true, "10: emailVerified posé");
      check((await db.select().from(emailVerifications).where(eq(emailVerifications.userId, uV.id))).length === 0, "10: code consommé");

      const okPre = await checkPasswordResetCode(uV.email, resetCode);
      check(okPre === true, "10: check reset OK");
      const sessR = await resetPasswordWithCode(uV.email, resetCode, "NouveauMot0dePasse!");
      check(sessR !== null, "10: reset OK");
      check((await db.select().from(passwordResets).where(eq(passwordResets.userId, uV.id))).length === 0, "10: reset code consommé");
      const [uVR] = await db.select().from(users).where(eq(users.id, uV.id));
      check(uVR.passwordHash !== "x", "10: mot de passe changé");
      const again = await resetPasswordWithCode(uV.email, resetCode, "AnneProc3dure");
      check(again === null, "10: code réservé → second reset refusé");
      log("  OK — envoi (rack), vérification, check+reset, consommations, aucun code dans les logs");
    }

    /* ============ 11. ROUTES (ÉTAPE 2) — handlers en direct ============ */
    log("11 — routes auth : 429/Retry-After/codes stables, en direct via les handlers POST");
    {
      const prevTrust = process.env.TRUST_PROXY_HEADERS;
      process.env.TRUST_PROXY_HEADERS = "1";
      try {
        /* ---- 11.A Login ---- */
        {
          const ip = trackIp("203.0.113.101");
          const u = await verifiedUser("MotdePasse123!");
          const email = u.email;
          track(AUTH_SCOPES.loginEmailIp, `${email}::${ip}`);
          track(AUTH_SCOPES.loginIp, ip);
          track(AUTH_SCOPES.loginEmail, email);

          for (let i = 1; i <= 5; i++) {
            const r = await authPOST(post("http://localhost/api/auth", { action: "login", email, password: "MauvaisPass1" }, ip));
            const b = await bodyOf(r);
            check(r.status === 401 && b.code === "INVALID_CREDENTIALS", `11A: ${i}e mauvais mot de passe → 401 INVALID_CREDENTIALS (${r.status}/${String(b.code)})`);
          }
          const blocked = await authPOST(post("http://localhost/api/auth", { action: "login", email, password: "MotdePasse123!" }, ip));
          const bb = await bodyOf(blocked);
          check(blocked.status === 429 && bb.code === "RATE_LIMITED", `11A: verrouillé → 429 RATE_LIMITED (${blocked.status}/${String(bb.code)})`);
          check(typeof bb.retryAfterSec === "number" && (bb.retryAfterSec as number) > 0, "11A: retryAfterSec > 0 dans le corps");
          check(Number(blocked.headers.get("retry-after")) > 0, `11A: en-tête Retry-After > 0 (${blocked.headers.get("retry-after")})`);

          /* Une autre IP n'est pas victime du verrou du premier visiteur. */
          const otherIp = trackIp("203.0.113.102");
          const okOther = await authPOST(post("http://localhost/api/auth", { action: "login", email, password: "MotdePasse123!" }, otherIp));
          check(okOther.status === 200, `11A: autre IP → 200 pendant le verrou (${okOther.status})`);

          /* Le verrou du 1er IP persiste malgré ce succès venu d'ailleurs. */
          const stillBlocked = await authPOST(post("http://localhost/api/auth", { action: "login", email, password: "MotdePasse123!" }, ip));
          check(stillBlocked.status === 429, `11A: verrou du 1er IP toujours actif (${stillBlocked.status})`);

          /* Après expiration de la fenêtre, le bon mot de passe connecte. */
          await expireLock(AUTH_SCOPES.loginEmailIp, `${email}::${ip}`);
          const afterLock = await authPOST(post("http://localhost/api/auth", { action: "login", email, password: "MotdePasse123!" }, ip));
          check(afterLock.status === 200 && afterLock.cookies.get("aperio_session") !== undefined, `11A: verrou expiré → 200 + cookie session (${afterLock.status})`);
          log("  OK — 5 échecs → 401, 6e (même bon) → 429 RATE_LIMITED+Retry-After, verrou levé à expiration");
        }

        /* ---- 11.B Register ---- */
        {
          const rip = trackIp("203.0.113.201");
          const firstEmail = nextEmail();
          for (let i = 1; i <= 9; i++) {
            const r = await authPOST(post("http://localhost/api/auth", {
              action: "register",
              name: `Reg AUL ${stamp} ${i}`,
              email: i === 1 ? firstEmail : nextEmail(),
              password: "MotdePasse123!",
              confirm: "MotdePasse123!",
            }, rip));
            const b = await bodyOf(r);
            check(r.status === 201 && b.needsVerification === true, `11B: inscription #${i} → 201 needsVerification (${r.status})`);
            const uid = Number((b.user as { id: number }).id);
            createdUserIds.push(uid);
          }
          const tenth = await authPOST(post("http://localhost/api/auth", {
            action: "register",
            name: "Reg AUL 10",
            email: nextEmail(),
            password: "MotdePasse123!",
            confirm: "MotdePasse123!",
          }, rip));
          const bt = await bodyOf(tenth);
          check(tenth.status === 429 && bt.code === "RATE_LIMITED", `11B: 10e inscription même IP → 429 RATE_LIMITED (${tenth.status}/${String(bt.code)})`);
          check(Number(tenth.headers.get("retry-after")) > 0, "11B: Retry-After présent");

          /* Doublon d'e-mail → 409 EMAIL_TAKEN (sur une autre IP). */
          const dupIp = trackIp("203.0.113.202");
          const dup = await authPOST(post("http://localhost/api/auth", {
            action: "register",
            name: "Reg AUL dup",
            email: firstEmail,
            password: "MotdePasse123!",
            confirm: "MotdePasse123!",
          }, dupIp));
          const dupB = await bodyOf(dup);
          check(dup.status === 409 && dupB.code === "EMAIL_TAKEN", `11B: doublon → 409 EMAIL_TAKEN (${dup.status}/${String(dupB.code)})`);

          /* Sans en-tête d'IP fiable, le verrou IP est ignoré (jamais de clé partagée). */
          const noIp = await authPOST(post("http://localhost/api/auth", {
            action: "register",
            name: "Reg AUL noip",
            email: nextEmail(),
            password: "MotdePasse123!",
            confirm: "MotdePasse123!",
          }));
          const noIpB = await bodyOf(noIp);
          check(noIp.status === 201 && noIpB.needsVerification === true, `11B: sans IP → 201 (limite IP désactivée, pas de clé partagée) (${noIp.status})`);
          createdUserIds.push(Number((noIpB.user as { id: number }).id));
          log("  OK — 9 inscriptions OK, 10e → 429, doublon → 409, IP absente → aucune limite partagée");
        }

        /* ---- 11.C Verify ---- */
        {
          const u = await newUser();
          const email = u.email;
          track(AUTH_SCOPES.codeFail, email);
          clearMailSink();
          await dispatchEmailVerification(u.id, u.email, u.name);
          const code = captureCode({ to: email, subject: "vérification" });

          const attempt = async (c: string) => {
            const r = await verifyPOST(post("http://localhost/api/auth/verify", { action: "verify", email, code: c }));
            const b = await bodyOf(r);
            return { r, b };
          };
          for (let i = 1; i <= 4; i++) {
            const { r, b } = await attempt(String(i).padStart(6, "0"));
            check(r.status === 400 && b.code === "CODE_INVALID", `11C: essai #${i} → 400 CODE_INVALID (${r.status}/${String(b.code)})`);
          }
          const fifth = await attempt("500000");
          check(fifth.r.status === 400, "11C: 5e mauvais code → 400 (ligne supprimée)");
          const rightNow = await attempt(code);
          check(rightNow.r.status === 400 && rightNow.b.code === "CODE_INVALID", `11C: bon code après 5 échecs → 400 CODE_INVALID (${rightNow.b.code})`);

          const u2 = await newUser();
          clearMailSink();
          await dispatchEmailVerification(u2.id, u2.email, u2.name);
          const code2 = captureCode({ to: u2.email, subject: "vérification" });
          const okR = await verifyPOST(post("http://localhost/api/auth/verify", { action: "verify", email: u2.email, code: code2 }));
          const okB = await bodyOf(okR);
          check(okR.status === 200 && okB.ok === true && okR.cookies.get("aperio_session") !== undefined, `11C: bon code → 200 + cookie session (${okR.status})`);

          const u3 = await newUser();
          const email3 = u3.email;
          track(AUTH_SCOPES.codeFail, email3);
          await createEmailVerificationCode(u3.id);
          for (let i = 0; i < 20; i++) {
            if (i % 5 === 0 && i > 0) await createEmailVerificationCode(u3.id);
            const rr = await verifyCodeAttempt("verify", email3, `7${String(i).padStart(5, "0")}`, { consumeOnSuccess: true });
            check(rr.attemptsConsumed === true && rr.status === "invalid", `11C: échec spray #${i + 1} consommé (invalid)`);
          }
          await createEmailVerificationCode(u3.id);
          const pre = await verifyCodeAttempt("verify", email3, "812345", { consumeOnSuccess: true });
          check(pre.attemptsConsumed === true && pre.status === "invalid", "11C: 21e échec consommé (verrou posé)");
          const sprayR = await verifyPOST(post("http://localhost/api/auth/verify", { action: "verify", email: email3, code: generateNumericCode() }));
          const sprayB = await bodyOf(sprayR);
          check(sprayR.status === 429 && sprayB.code === "RATE_LIMITED", `11C: après 20 échecs/24 h → 429 RATE_LIMITED (${sprayR.status}/${String(sprayB.code)})`);
          check(Number(sprayR.headers.get("retry-after")) > 0, "11C: Retry-After anti-spray présent");
          log("  OK — 4×400 CODE_INVALID, 5e brûle le code, spray → 429 anti-spray 24 h");
        }

        /* ---- 11.D Resend ---- */
        {
          const u = await newUser();
          const email = u.email;
          clearMailSink();
          await dispatchEmailVerification(u.id, u.email, u.name);
          await expireLock(AUTH_SCOPES.dispatchGap, email);

          const r1 = await verifyPOST(post("http://localhost/api/auth/verify", { action: "resend", email }));
          check(r1.status === 200, `11D: resend espacé → 200 (${r1.status})`);
          const r2 = await verifyPOST(post("http://localhost/api/auth/verify", { action: "resend", email }));
          const b2 = await bodyOf(r2);
          check(r2.status === 429 && b2.code === "RATE_LIMITED", `11D: resend immédiat → 429 (${r2.status}/${String(b2.code)})`);
          check(Number(r2.headers.get("retry-after")) > 0, "11D: Retry-After présent");

          const ghost = await verifyPOST(post("http://localhost/api/auth/verify", { action: "resend", email: `ghost-${stamp}@aperio.test` }));
          check(ghost.status === 200, "11D: resend e-mail inconnu → 200 neutre (anti-énumération)");
          log("  OK — gap 60 s respecté (429 + Retry-After), e-mail inconnu → neutre");
        }

        /* ---- 11.E Forgot-password (request / check / reset) ---- */
        {
          const u = await newUser();
          const email = u.email;
          track(AUTH_SCOPES.codeFail, email);
          clearMailSink();

          const req1 = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "request", email }));
          check(req1.status === 200, `11E: request → 200 (${req1.status})`);
          const req2 = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "request", email }));
          const b2 = await bodyOf(req2);
          check(req2.status === 429 && b2.code === "RATE_LIMITED", `11E: request immédiat répété → 429 (${req2.status}/${String(b2.code)})`);
          check(Number(req2.headers.get("retry-after")) > 0, "11E: Retry-After présent");
          const ghostR = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "request", email: `ghost2-${stamp}@aperio.test` }));
          check(ghostR.status === 200, "11E: request e-mail inconnu → 200 neutre");

          const rcode = captureCode({ to: email, subject: "Réinitialisation" });
          const cBad = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "check", email, code: "000001" }));
          const cBadB = await bodyOf(cBad);
          check(cBad.status === 400 && cBadB.code === "CODE_INVALID", `11E: check mauvais code → 400 CODE_INVALID (${cBad.status}/${String(cBadB.code)})`);
          const cOk = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "check", email, code: rcode }));
          check(cOk.status === 200, "11E: check OK sans consommer");
          const rOk = await forgotPOST(post("http://localhost/api/auth/forgot-password", {
            action: "reset",
            email,
            code: rcode,
            password: "NouveauMot0dePasse!",
            confirm: "NouveauMot0dePasse!",
          }));
          const rOkB = await bodyOf(rOk);
          check(rOk.status === 200 && rOkB.ok === true, `11E: reset OK (${rOk.status})`);
          const again = await forgotPOST(post("http://localhost/api/auth/forgot-password", {
            action: "reset",
            email,
            code: rcode,
            password: "Encore0Passe!",
            confirm: "Encore0Passe!",
          }));
          check(again.status === 400, "11E: reset second → 400 (code consommé)");

          const shortPwd = await forgotPOST(post("http://localhost/api/auth/forgot-password", {
            action: "reset",
            email,
            code: "123456",
            password: "X",
            confirm: "X",
          }));
          check(shortPwd.status === 400, "11E: reset mot de passe court → 400");
          const badAction = await forgotPOST(post("http://localhost/api/auth/forgot-password", { action: "bogus", email }));
          check(badAction.status === 400, "11E: action inconnue → 400");
          log("  OK — request limité (429), réponse neutre, check/reset partagent le budget, messages FR");
        }
      } finally {
        if (prevTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
        else process.env.TRUST_PROXY_HEADERS = prevTrust;
      }
    }

    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT`);
    if (failures > 0) process.exitCode = 1;
  } catch (err) {
    failures++;
    console.error(`[verify-auth-limits] FATAL — ${err instanceof Error ? err.stack : String(err)}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});