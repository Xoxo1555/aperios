/**
 * Vérification HTTP de l'idempotence de POST /api/checkout/wallet.
 *
 * Tout passe par le SERVEUR réel (http://localhost:3000) avec le compte démo
 * acheteur et une photo "limited" réelle de la base. Les comptes d'état
 * (solde buyer, solde photographe, stock, nombre de certificates,
 * order_items, orders, wallet_transactions) sont lus AVANT, puis restaurés
 * EXACTEMENT APRÈS (aucune valeur en dur) — y compris le wallet du buyer
 * refinançé pour couvrir les paiements.
 *
 * Cas :
 *  a) même clé + même contenu, rejouée : 201 puis 200 alreadyProcessed,
 *     MÊME orderNumber, 1 seul débit, 1 cert, stock −1.
 *  b) clé différente, même contenu : NOUVEAU ordre (orderNumber différent).
 *  c) même clé, contenu différent (qty modifiée) : 422, aucun ordre créé,
 *     aucun débit.
 *  d) sans en-tête Idempotency-Key : 400.
 *  e) concurrence (Promise.all, même clé) : un SEUL ordre créé,
 *     un SEUL débit, un SEUL cert.
 *  f) forte concurrence : 5 clés distinctes × 10 requêtes parallèles chacune.
 *     Chaque clé → un SEUL ordre, un SEUL débit, un SEUL cert ; uniquement
 *     des réponses 200/201 (jamais 500).
 *
 * Usage :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-idempotency.ts
 */
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db";
import { certificates, orderItems, orders, photos, users, walletTransactions } from "../db/schema";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion (prouvé : exit 1). */
assertLocalDatabase();

const BASE = process.env.APERIO_BASE_URL ?? "http://localhost:3000";
const EMAIL = "buyer@aperio.gallery";
const PASSWORD = "buyer123";
const PHOTO_ID = 4170;

/** Montant ajouté à la réserve disponible du buyer pour couvrir les paiements
 *  du test (cas a/b/c/e = 4 commandes ; le surplus large garantit qu'aucun
 *  402 ne provient du financement démo). La valeur exacte est restaurée à
 *  l'identique après le test. */
const FUND_ADD = "50000.00";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-idempotency] ${msg}`);

const payload = (qty = 1) => ({
  items: [{ photoId: PHOTO_ID, sizeId: null, mountId: null, qty }],
  shipName: "Acheteur Test",
  shipEmail: EMAIL,
  shipAddress: { line1: "1 Rue de Test", city: "Antananarivo", state: "Analamanga", zip: "101", country: "Madagascar" },
  currency: "EUR",
});

async function post(path: string, body: unknown, cookie: string | null, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function orderByKey(key: string) {
  const [row] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, total: orders.total })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  return row ?? null;
}

async function certsForOrder(orderId: number) {
  const items = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return 0;
  const rows = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(inArray(certificates.orderItemId, items.map((i) => i.id)));
  return rows.length;
}

async function countLedger(reference: string) {
  const rows = await db
    .select({ id: walletTransactions.id })
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, reference));
  return rows.length;
}

async function main() {
  const createdKeys: string[] = [];

  /* ---------- Comptage de référence AVANT ---------- */
  const countBaseline = async () => ({
    orders: (await db.select({ id: orders.id }).from(orders)).length,
    certificates: (await db.select({ id: certificates.id }).from(certificates)).length,
    orderItems: (await db.select({ id: orderItems.id }).from(orderItems)).length,
    walletTransactions: (await db.select({ id: walletTransactions.id }).from(walletTransactions)).length,
  });

  const baseline = await countBaseline();
  const [photoRow0] = await db.select().from(photos).where(eq(photos.id, PHOTO_ID)).limit(1);
  if (!photoRow0) throw new Error(`Photo de test ${PHOTO_ID} introuvable`);
  const stock0 = photoRow0.availableStock as number;
  const [buyerRow0] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!buyerRow0) throw new Error(`Acheteur ${EMAIL} introuvable`);
  const photographerId0 = photoRow0.photographerId;
  const [photogRow0] = await db.select().from(users).where(eq(users.id, photographerId0)).limit(1);
  const buyerBalance0 = parseFloat(buyerRow0.availableBalance ?? "0");
  const photogBalance0 = parseFloat(photogRow0.availableBalance ?? "0");
  log(`AVANT — buyer=${buyerBalance0.toFixed(2)}, photog=${photogBalance0.toFixed(2)}, stock=${stock0}, orders=${baseline.orders}, certs=${baseline.certificates}, oi=${baseline.orderItems}, wt=${baseline.walletTransactions}`);

  const createdOrderNumbers: string[] = [];

  const cleanup = async () => {
    for (const key of createdKeys) {
      await db.delete(orders).where(eq(orders.idempotencyKey, key)).catch((e) => console.warn("[cleanup] orders", e.message));
    }
    for (const num of createdOrderNumbers) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.reference, `PRC-${num}`))
        .catch((e) => console.warn("[cleanup] ledger", e.message));
    }
    await db.update(users).set({ availableBalance: String(buyerBalance0) }).where(eq(users.id, buyerRow0.id));
    await db.update(users).set({ availableBalance: String(photogBalance0) }).where(eq(users.id, photographerId0));
    await db.update(photos).set({ availableStock: stock0 }).where(eq(photos.id, PHOTO_ID));
  };

  try {
    /* ---------- Connexion (compte démo acheteur) ---------- */
    const login = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: EMAIL, password: PASSWORD }),
    });
    check(login.status === 200, `login démo acheteur (${login.status})`);
    const cookies = login.headers.getSetCookie?.() ?? [];
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    check(cookie.includes("aperio_session"), "cookie aperio_session reçu");

    /* ---------- Refinancement du wallet buyer (directement en base, puis
       restauré à l'identique dans cleanup) ---------- */
    await db
      .update(users)
      .set({ availableBalance: String(buyerBalance0 + parseFloat(FUND_ADD)) })
      .where(eq(users.id, buyerRow0.id));
    const funded = buyerBalance0 + parseFloat(FUND_ADD);

    /* ===== Cas d) : pas d'Idempotency-Key => 400 ===== */
    log("Cas d — pas d'en-tête Idempotency-Key");
    const rd = await post("/api/checkout/wallet", payload(), cookie);
    check(rd.status === 400, `sans clé → 400 (reçu ${rd.status})`);
    check(/Idempotency-Key/.test((rd.data as { error?: string }).error ?? ""), `message explicite sur la clé (${(rd.data as { error?: string }).error})`);
    log(`  OK — 400 sans clé`);

    /* ===== Cas a) : même clé rejouée => 201 puis 200 alreadyProcessed ===== */
    log("Cas a — même clé + même contenu, rejoué");
    const keyA = randomUUID();
    createdKeys.push(keyA);
    const ra1 = await post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyA });
    check(ra1.status === 201, `1er appel clé A → 201 (reçu ${ra1.status})`);
    const numberA = (ra1.data as { orderNumber: string }).orderNumber;
    createdOrderNumbers.push(numberA);
    const orderA = await orderByKey(keyA);
    check(orderA?.orderNumber === numberA, "l'ordre créé porte la clé A");
    const totalA = parseFloat(orderA!.total);

    const ra2 = await post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyA });
    check(ra2.status === 200, `rejeu clé A → 200 (reçu ${ra2.status})`);
    check((ra2.data as { orderNumber: string }).orderNumber === numberA, "MÊME orderNumber au rejeu");
    check((ra2.data as { alreadyProcessed: boolean }).alreadyProcessed === true, "alreadyProcessed:true au rejeu");
    check((await orderByKey(keyA))?.id === orderA!.id, "toujours UN SEUL ordre pour la clé A");

    const [buyerA] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
    check(Math.abs(parseFloat(buyerA.b) - (funded - totalA)) < 0.001, `UN seul débit après rejeu (${(funded - parseFloat(buyerA.b)).toFixed(2)}, attendu ${totalA.toFixed(2)})`);
    check((await certsForOrder(orderA!.id)) === 1, "1 seul certificat (pas de doublon)");
    check((await countLedger(`PRC-${numberA}`)) === 1, "1 seule ligne ledger (pas de doublon)");
    const [photoA] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
    check((photoA.s as number) === stock0 - 1, `stock −1 après a) (${photoA.s}, attendu ${stock0 - 1})`);
    log(`  OK — 201 puis 200 alreadyProcessed, même ordre ${numberA}, 1 débit de ${totalA.toFixed(2)}, 1 cert, stock=${photoA.s}`);

    /* ===== Cas b) : clé différente => nouvel ordre ===== */
    log("Cas b — clé différente, même contenu");
    const keyB = randomUUID();
    createdKeys.push(keyB);
    const rb = await post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyB });
    check(rb.status === 201, `clé B → 201 (reçu ${rb.status})`);
    const numberB = (rb.data as { orderNumber: string }).orderNumber;
    createdOrderNumbers.push(numberB);
    check(numberB !== numberA, "orderNumber différent de la clé A");
    const orderB = await orderByKey(keyB);
    check(orderB?.orderNumber === numberB, "l'ordre B porte la clé B");
    const totalB = parseFloat(orderB!.total);
    const [buyerB] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
    check(Math.abs(parseFloat(buyerB.b) - (funded - totalA - totalB)) < 0.001, "débit cumulé A + B");
    const [photoB] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
    check((photoB.s as number) === stock0 - 2, `stock −2 après b) (${photoB.s})`);
    log(`  OK — nouvel ordre ${numberB}, 2 Au total, stock=${photoB.s}`);

    /* ===== Cas c) : même clé, contenu différent => 422, aucun rejeu ===== */
    log("Cas c — même clé, contenu différent (qty 2)");
    const keyC = randomUUID();
    createdKeys.push(keyC);
    const rc1 = await post("/api/checkout/wallet", payload(1), cookie, { "Idempotency-Key": keyC });
    check(rc1.status === 201, `clé C (qty 1) → 201 (reçu ${rc1.status})`);
    const numberC = (rc1.data as { orderNumber: string }).orderNumber;
    createdOrderNumbers.push(numberC);
    const orderC = await orderByKey(keyC);
    check(orderC?.orderNumber === numberC, "l'ordre C porte la clé C");

    const rc2 = await post("/api/checkout/wallet", payload(2), cookie, { "Idempotency-Key": keyC });
    check(rc2.status === 422, `clé C avec qty différente → 422 (reçu ${rc2.status})`);
    check((await orderByKey(keyC))?.id === orderC!.id, "toujours UN SEUL ordre pour la clé C (contre-test gardé)");
    const [buyerC] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
    check(Math.abs(parseFloat(buyerC.b) - (funded - totalA - totalB - totalC(orderC!))) < 0.001, "aucun débit supplémentaire après 422");
    const [photoC] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
    check((photoC.s as number) === stock0 - 3, `stock inchangé après 422 (${photoC.s}, attendu ${stock0 - 3})`);
    log(`  OK — 422 sans ordre ni débit (stock=${photoC.s})`);

    /* ===== Cas e) : concurrence (Promise.all, même clé, même contenu) ===== */
    log("Cas e — 2 appels concurrents, même clé");
    const keyE = randomUUID();
    createdKeys.push(keyE);
    const [re1, re2] = await Promise.all([
      post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyE }),
      post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyE }),
    ]);
    for (const [i, r] of [re1, re2].entries()) {
      check(r.status === 200 || r.status === 201, `concurrent ${i + 1} → 200 ou 201 (reçu ${r.status})`);
    }
    const n1 = (re1.data as { orderNumber: string }).orderNumber;
    const n2 = (re2.data as { orderNumber: string }).orderNumber;
    check(n1 === n2, `mêmes orderNumber chez les 2 concurrents (${n1} vs ${n2})`);
    createdOrderNumbers.push(n1);
    const orderE = await orderByKey(keyE);
    check(orderE?.orderNumber === n1, "UN SEUL ordre créé pour la clé E");
    const totalE = parseFloat(orderE!.total);
    const [buyerE] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
    check(Math.abs(parseFloat(buyerE.b) - (funded - totalA - totalB - totalC(orderC!) - totalE)) < 0.001, "UN seul débit malgré la concurrence");
    check((await certsForOrder(orderE!.id)) === 1, "1 seul certificat (concurrence)");
    check((await countLedger(`PRC-${n1}`)) === 1, "1 seule ligne ledger (concurrence)");
    const [photoE] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
    check((photoE.s as number) === stock0 - 4, `stock −1 avec la concurrence (${photoE.s}, attendu ${stock0 - 4})`);
    log(`  OK — concurrents: ${re1.status}/${re2.status}, UN ordre ${n1}, UN débit de ${totalE.toFixed(2)}, 1 cert, stock=${photoE.s}`);

    /* ===== Cas f) : forte concurrence — 5 clés × 10 requêtes parallèles ===== */
    log("Cas f — 5 clés différentes × 10 requêtes parallèles chacune");
    const ROUNDS = 5;
    const PARALLEL = 10;
    for (let round = 0; round < ROUNDS; round++) {
      const keyF = randomUUID();
      createdKeys.push(keyF);

      const [beforeB] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
      const [beforeS] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
      const beforeBal = parseFloat(beforeB.b);
      const beforeStock = beforeS.s as number;

      const results = await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          post("/api/checkout/wallet", payload(), cookie, { "Idempotency-Key": keyF }),
        ),
      );

      for (const [i, r] of results.entries()) {
        check(r.status === 200 || r.status === 201, `f round ${round + 1} req ${i + 1} → 200/201 uniquement (reçu ${r.status})`);
      }
      const created = results.filter((r) => r.status === 201);
      check(created.length === 1, `f round ${round + 1} : exactement un 201 (reçu ${created.length})`);

      const nums = new Set(results.map((r) => (r.data as { orderNumber?: string }).orderNumber));
      check(nums.size === 1 && !nums.has(undefined), `f round ${round + 1} : même orderNumber chez les ${PARALLEL} (${[...nums].join(",")})`);
      const numF = [...nums][0]!;
      createdOrderNumbers.push(numF);

      const orderF = await orderByKey(keyF);
      check(orderF?.orderNumber === numF, `f round ${round + 1} : UN SEUL ordre pour la clé`);
      const totalF = parseFloat(orderF!.total);

      const [afterB] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyerRow0.id));
      const [afterS] = await db.select({ s: photos.availableStock }).from(photos).where(eq(photos.id, PHOTO_ID));
      check(Math.abs(beforeBal - parseFloat(afterB.b) - totalF) < 0.001, `f round ${round + 1} : UN débit de ${totalF.toFixed(2)} (réel ${(beforeBal - parseFloat(afterB.b)).toFixed(2)})`);
      check(beforeStock - (afterS.s as number) === 1, `f round ${round + 1} : stock −1 (réel ${beforeStock - (afterS.s as number)})`);
      check((await certsForOrder(orderF!.id)) === 1, `f round ${round + 1} : 1 seul certificat`);
      check((await countLedger(`PRC-${numF}`)) === 1, `f round ${round + 1} : 1 seule ligne ledger`);
      log(`  OK — round ${round + 1}/${ROUNDS}: ${PARALLEL} requêtes (201×1, 200×${PARALLEL - 1}), ordre ${numF}, 1 débit de ${totalF.toFixed(2)}, 1 cert, stock=${afterS.s}`);
    }
    log(`  OK — cas f : ${ROUNDS * PARALLEL} requêtes, ${ROUNDS} ordres (un par clé), aucun 500`);

    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    log("Nettoyage et restauration de l'état…");
    await cleanup();

    const after = await countBaseline();
    const [photoRow1] = await db.select().from(photos).where(eq(photos.id, PHOTO_ID)).limit(1);
    const [buyerRow1] = await db.select().from(users).where(eq(users.id, buyerRow0.id)).limit(1);
    const [photogRow1] = await db.select().from(users).where(eq(users.id, photographerId0)).limit(1);
    log(`APRÈS — buyer=${buyerRow1.availableBalance}, photog=${photogRow1.availableBalance}, stock=${photoRow1.availableStock}, orders=${after.orders}, certs=${after.certificates}, oi=${after.orderItems}, wt=${after.walletTransactions}`);
    if (
      after.orders !== baseline.orders ||
      after.certificates !== baseline.certificates ||
      after.orderItems !== baseline.orderItems ||
      after.walletTransactions !== baseline.walletTransactions ||
      parseFloat(buyerRow1.availableBalance ?? "0") !== buyerBalance0 ||
      parseFloat(photogRow1.availableBalance ?? "0") !== photogBalance0 ||
      (photoRow1.availableStock as number) !== stock0
    ) {
      failures++;
      console.error(`[verify-idempotency] ASSERTION FAILED: état non restauré (avant buyer=${buyerBalance0}, photog=${photogBalance0}, stock=${stock0}, o=${baseline.orders}, c=${baseline.certificates}, oi=${baseline.orderItems}, wt=${baseline.walletTransactions} | après buyer=${buyerRow1.availableBalance}, photog=${photogRow1.availableBalance}, stock=${photoRow1.availableStock}, o=${after.orders}, c=${after.certificates}, oi=${after.orderItems}, wt=${after.walletTransactions})`);
      process.exitCode = 1;
    } else {
      log("État restauré à l'identique — aucune donnée résiduelle.");
    }
  }
}

/** Total d'un ordre récupéré depuis la base (source de vérité). */
function totalC(order: { total: string }): number {
  return parseFloat(order.total);
}

main().catch((err) => {
  console.error("[verify-idempotency] ERREUR :", err);
  process.exitCode = 1;
});