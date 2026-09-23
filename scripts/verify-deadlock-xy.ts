/**
 * Vérification jetable C5+ — interblocage réel entre deux utilisateurs X et Y
 * qui sont TOUS DEUX photographes ET acheteurs.
 *
 * 1. Chaque itération : X paie une photo de Y pendant que Y paie une photo de
 *    X, via `payOrderWithWallet` en Promise.all. Chaque transaction verrouille
 *    sa propre ligne `users` (débit) puis celle de l'autre (crédit
 *    photographe) : ordre de verrous opposé → interblocage Postgres (40P01)
 *    possible, que le tri par `photo_id` ne prévient pas. Le `withRetry` de
 *    lib/orders.ts doit rejouer UNE fois et les deux paiements aboutir.
 * 2. Compte les 40P01/40001 réellement levés par le driver pg (instrumentation
 *    de `pg.Client.prototype.query`) pour savoir si le retry a servi.
 * 3. Tests unitaires de `withRetry` (3 tentatives max) : 40P01 une fois puis
 *    succès ; 40P01 deux fois → succès au 3e essai ; 40P01 trois fois →
 *    propagation ; cause encapsulée (40001) → rejoué ; 23505 → non rejoué.
 * 4. Vérifie qu'aucun état partiel ni double débit ne subsiste, puis restaure
 *    l'état (comptages identiques avant/après).
 *
 * Usage :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-deadlock-xy.ts
 */
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "../db";
import {
  certificates,
  orderItems,
  orders,
  photos,
  users,
  walletTransactions,
} from "../db/schema";
import { createPendingOrder, payOrderWithWallet, withRetry } from "../lib/orders";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion. */
assertLocalDatabase();

/* ------------------------------------------------------------------ */
/*  Instrumentation : compte les codes d'erreur Postgres réels.        */
/*  drizzle utilise `pool.connect()` pour les transactions, donc les   */
/*  erreurs passent par `pg.Client`, pas `pool.query`.                 */
/* ------------------------------------------------------------------ */
const pgErrorCounts: Record<string, number> = {};
(function instrumentPgClient() {
  const proto = Client.prototype as unknown as { query: (...args: unknown[]) => unknown };
  const orig = proto.query;
  proto.query = function (this: unknown, ...args: unknown[]) {
    const res = orig.apply(this, args) as unknown;
    if (res && typeof (res as Promise<unknown>).then === "function") {
      (res as Promise<unknown>).catch((e: unknown) => {
        const code =
          (e as { code?: string } | null)?.code ??
          (e as { cause?: { code?: string } } | null)?.cause?.code;
        if (code) pgErrorCounts[code] = (pgErrorCounts[code] ?? 0) + 1;
      });
    }
    return res;
  };
})();

const stamp = Date.now().toString(36);
const PASSWORD_HASH = "verify-not-used";
const ITERATIONS = 20;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-deadlock-xy] ${msg}`);

async function countRows(table: "orders" | "certificates" | "order_items" | "wallet_transactions") {
  switch (table) {
    case "orders":
      return (await db.select({ id: orders.id }).from(orders)).length;
    case "certificates":
      return (await db.select({ id: certificates.id }).from(certificates)).length;
    case "order_items":
      return (await db.select({ id: orderItems.id }).from(orderItems)).length;
    case "wallet_transactions":
      return (await db.select({ id: walletTransactions.id }).from(walletTransactions)).length;
  }
}

/** Tests unitaires du helper de retry (exporté pour les tests). */
async function testWithRetryUnit() {
  const mk = (code: string) => Object.assign(new Error(`pg ${code}`), { code });

  let calls = 0;
  const ok = await withRetry(async () => {
    calls++;
    if (calls === 1) throw mk("40P01");
    return "ok";
  });
  check(ok === "ok" && calls === 2, `withRetry: 40P01 une fois puis succès (appels=${calls}, résultat=${ok})`);
  log(`  OK — withRetry: 40P01 (1 fois) → rejoué, succès au 2e essai (${calls} appels)`);

  calls = 0;
  let propagated: unknown = null;
  try {
    await withRetry(async () => {
      calls++;
      throw mk("40P01");
    });
  } catch (e) {
    propagated = e;
  }
  check(propagated !== null && calls === 3, `withRetry: 40P01 trois fois → propagation après 3 appels (appels=${calls})`);
  log(`  OK — withRetry: 40P01 (3 fois) → propagé après ${calls} appels (pas de boucle infinie)`);

  calls = 0;
  const afterTwo = await withRetry(async () => {
    calls++;
    if (calls <= 2) throw mk("40P01");
    return "ok-3";
  });
  check(afterTwo === "ok-3" && calls === 3, `withRetry: 40P01 deux fois puis succès au 3e essai (appels=${calls}, résultat=${afterTwo})`);
  log(`  OK — withRetry: 40P01 (2 fois) → succès au 3e essai (${calls} appels)`);

  calls = 0;
  const wrapped = await withRetry(async () => {
    calls++;
    if (calls === 1) {
      const inner = mk("40001");
      throw Object.assign(new Error("Failed query (wrappée)"), { cause: inner });
    }
    return 42;
  });
  check(wrapped === 42 && calls === 2, `withRetry: cause encapsulée 40001 rejouée (appels=${calls})`);
  log(`  OK — withRetry: 40001 dans .cause (drizzle) → rejoué (${calls} appels)`);

  calls = 0;
  let nonRetry: unknown = null;
  try {
    await withRetry(async () => {
      calls++;
      const inner = mk("23505");
      throw Object.assign(new Error("Failed query (wrappée)"), { cause: inner });
    });
  } catch (e) {
    nonRetry = e;
  }
  check(nonRetry !== null && calls === 1, `withRetry: 23505 dans .cause NON rejoué (appels=${calls})`);
  log(`  OK — withRetry: 23505 dans .cause → NON rejoué (${calls} appel)`);
}

async function main() {
  const createdOrderIds: number[] = [];
  const createdOrderNumbers: string[] = [];
  const createdPhotoIds: number[] = [];
  const createdUserIds: number[] = [];

  const baseline = {
    orders: await countRows("orders"),
    certificates: await countRows("certificates"),
    orderItems: await countRows("order_items"),
    walletTransactions: await countRows("wallet_transactions"),
  };
  log(
    `AVANT — orders=${baseline.orders}, certificates=${baseline.certificates}, order_items=${baseline.orderItems}, wallet_transactions=${baseline.walletTransactions}`,
  );

  const cleanup = async () => {
    for (const num of createdOrderNumbers) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.reference, `PRC-${num}`))
        .catch((e) => console.warn("[cleanup] ledger", e.message));
    }
    for (const id of createdOrderIds) {
      await db.delete(orders).where(eq(orders.id, id)).catch((e) => console.warn("[cleanup] orders", e.message));
    }
    for (const id of createdPhotoIds) {
      await db.delete(photos).where(eq(photos.id, id)).catch((e) => console.warn("[cleanup] photos", e.message));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id)).catch((e) => console.warn("[cleanup] users", e.message));
    }
  };

  try {
    log("Test unitaire — withRetry");
    await testWithRetryUnit();

    /* ---------- X et Y : photographes ET acheteurs ---------- */
    const [x] = await db
      .insert(users)
      .values({
        name: `Deadlock X ${stamp}`,
        email: `deadlock-x-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
        availableBalance: "100000.00",
      })
      .returning();
    const [y] = await db
      .insert(users)
      .values({
        name: `Deadlock Y ${stamp}`,
        email: `deadlock-y-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
        availableBalance: "100000.00",
      })
      .returning();
    createdUserIds.push(x.id, y.id);

    const [photoX] = await db
      .insert(photos)
      .values({
        title: `Deadlock Photo X ${stamp}`,
        slug: `deadlock-photo-x-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: x.id,
        basePrice: "49.90",
        totalEditions: 500,
        availableStock: 500,
        isPublished: true,
      })
      .returning();
    const [photoY] = await db
      .insert(photos)
      .values({
        title: `Deadlock Photo Y ${stamp}`,
        slug: `deadlock-photo-y-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "portrait",
        licenseType: "limited",
        photographerId: y.id,
        basePrice: "49.90",
        totalEditions: 500,
        availableStock: 500,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoX.id, photoY.id);

    const startX = 100000;
    const startY = 100000;
    const shippingFor = (u: { name: string; email: string }) => ({
      name: u.name,
      email: u.email,
      address: { city: "Antananarivo" },
    });

    log(`Test interblocage X<->Y — ${ITERATIONS} itérations de paiements croisés concurrents (Promise.all)`);
    let successes = 0;
    let rejected = 0;
    const rejectionDetails: string[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const buyFromY = await createPendingOrder({
        userId: x.id,
        items: [{ photoId: photoY.id, sizeId: null, mountId: null, qty: 1 }],
        shipping: shippingFor(x),
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        currency: "EUR",
      });
      const buyFromX = await createPendingOrder({
        userId: y.id,
        items: [{ photoId: photoX.id, sizeId: null, mountId: null, qty: 1 }],
        shipping: shippingFor(y),
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        currency: "EUR",
      });
      createdOrderIds.push(buyFromY.order.id, buyFromX.order.id);
      createdOrderNumbers.push(buyFromY.order.orderNumber, buyFromX.order.orderNumber);

      const settled = await Promise.allSettled([
        payOrderWithWallet(buyFromY.order, x.id),
        payOrderWithWallet(buyFromX.order, y.id),
      ]);
      for (const s of settled) {
        if (s.status === "fulfilled") successes++;
        else {
          rejected++;
          rejectionDetails.push(String(s.reason));
        }
      }
    }

    const d40 = pgErrorCounts["40P01"] ?? 0;
    const d40001 = pgErrorCounts["40001"] ?? 0;
    log(`  Interblocages réellement levés par pg : 40P01=${d40}, 40001=${d40001}`);
    log(`  Paiements réussis=${successes}/${2 * ITERATIONS}, rejetés=${rejected}`);
    if (rejectionDetails.length) log(`  Détails rejets : ${rejectionDetails.slice(0, 5).join(" | ")}`);

    check(successes + rejected === 2 * ITERATIONS, `total paiements = ${2 * ITERATIONS} (réussis=${successes}, rejetés=${rejected})`);
    check(rejected === 0, `${rejected} paiement(s) rejeté(s) après retry — attendu 0 (retry 40P01)`);

    /* ---------- Cohérence globale : aucun état partiel / double débit ---------- */
    const paidXY = await db.select().from(orders).where(and(eq(orders.userId, x.id), eq(orders.status, "paid")));
    const paidYX = await db.select().from(orders).where(and(eq(orders.userId, y.id), eq(orders.status, "paid")));
    const debitX = paidXY.reduce((a, o) => a + parseFloat(o.total), 0);
    const debitY = paidYX.reduce((a, o) => a + parseFloat(o.total), 0);

    const shareRows = await db
      .select({ photoId: orderItems.photoId, share: orderItems.photographerShare })
      .from(orderItems);
    const shareToX = shareRows
      .filter((r) => r.photoId === photoX.id && r.share !== null)
      .reduce((a, r) => a + parseFloat(r.share as string), 0);
    const shareToY = shareRows
      .filter((r) => r.photoId === photoY.id && r.share !== null)
      .reduce((a, r) => a + parseFloat(r.share as string), 0);

    const [xNow] = await db.select().from(users).where(eq(users.id, x.id));
    const [yNow] = await db.select().from(users).where(eq(users.id, y.id));
    const xBal = parseFloat(xNow.availableBalance ?? "0");
    const yBal = parseFloat(yNow.availableBalance ?? "0");

    check(
      Math.abs(xBal - (startX - debitX + shareToX)) < 0.01,
      `solde X cohérent (${xBal.toFixed(2)} = ${startX} - ${debitX.toFixed(2)} + ${shareToX.toFixed(2)})`,
    );
    check(
      Math.abs(yBal - (startY - debitY + shareToY)) < 0.01,
      `solde Y cohérent (${yBal.toFixed(2)} = ${startY} - ${debitY.toFixed(2)} + ${shareToY.toFixed(2)})`,
    );

    const [photoXNow] = await db.select().from(photos).where(eq(photos.id, photoX.id));
    const [photoYNow] = await db.select().from(photos).where(eq(photos.id, photoY.id));
    check(photoXNow.availableStock === 500 - paidYX.length, `stock photoX = 500 - ${paidYX.length} réussis (${photoXNow.availableStock})`);
    check(photoYNow.availableStock === 500 - paidXY.length, `stock photoY = 500 - ${paidXY.length} réussis (${photoYNow.availableStock})`);

    const paidOrderIds = [...paidXY, ...paidYX].map((o) => o.id);
    const paidItems = paidOrderIds.length
      ? (await db.select().from(orderItems)).filter((i) => paidOrderIds.includes(i.orderId))
      : [];
    const paidItemIds = paidItems.map((i) => i.id);

    let certCount = 0;
    for (const id of paidItemIds) {
      certCount += (await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.orderItemId, id))).length;
    }
    check(certCount === paidItemIds.length, `1 certificat par ligne payée (certs=${certCount}, lignes=${paidItemIds.length})`);

    let ledgerCount = 0;
    for (const o of [...paidXY, ...paidYX]) {
      ledgerCount += (await db.select({ id: walletTransactions.id }).from(walletTransactions).where(eq(walletTransactions.reference, `PRC-${o.orderNumber}`))).length;
    }
    check(ledgerCount === paidOrderIds.length, `1 ligne ledger par commande payée (ledger=${ledgerCount}, payées=${paidOrderIds.length})`);

    const allCreated = await db.select().from(orders);
    const lingeringPending = allCreated.filter(
      (o) => createdOrderIds.includes(o.id) && o.status === "pending",
    ).length;
    check(lingeringPending === 0, `aucune commande laissée "pending" (${lingeringPending})`);

    log(
      `  OK — X solde ${xBal.toFixed(2)}, Y solde ${yBal.toFixed(2)}, stocks X=${photoXNow.availableStock}/Y=${photoYNow.availableStock}, certs=${certCount}, ledger=${ledgerCount}, aucun pending`,
    );

    if (d40 + d40001 === 0) {
      log("  OK — X<->Y : aucun 40P01/40001 (verrous users triés) ; le retry reste un filet de sécurité.");
    } else {
      log(`  OK — X<->Y : retry exercé, ${d40 + d40001} erreur(s) de concurrence rattrapée(s) par withRetry.`);
    }

    /* ---------- Multi-photographes : A+B et B+A croisés ---------- */
    const d40BeforeMulti = pgErrorCounts["40P01"] ?? 0;
    const d40001BeforeMulti = pgErrorCounts["40001"] ?? 0;

    const [photographerA] = await db
      .insert(users)
      .values({
        name: `Multi Photo A ${stamp}`,
        email: `multi-photo-a-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
        availableBalance: "100000.00",
      })
      .returning();
    const [photographerB] = await db
      .insert(users)
      .values({
        name: `Multi Photo B ${stamp}`,
        email: `multi-photo-b-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
        availableBalance: "100000.00",
      })
      .returning();
    const [buyerU] = await db
      .insert(users)
      .values({
        name: `Multi Buyer U ${stamp}`,
        email: `multi-buyer-u-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "buyer",
        availableBalance: "100000.00",
      })
      .returning();
    const [buyerV] = await db
      .insert(users)
      .values({
        name: `Multi Buyer V ${stamp}`,
        email: `multi-buyer-v-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "buyer",
        availableBalance: "100000.00",
      })
      .returning();
    createdUserIds.push(photographerA.id, photographerB.id, buyerU.id, buyerV.id);

    const [photoA] = await db
      .insert(photos)
      .values({
        title: `Multi Photo A ${stamp}`,
        slug: `multi-photo-a-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographerA.id,
        basePrice: "49.90",
        totalEditions: 500,
        availableStock: 500,
        isPublished: true,
      })
      .returning();
    const [photoB] = await db
      .insert(photos)
      .values({
        title: `Multi Photo B ${stamp}`,
        slug: `multi-photo-b-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographerB.id,
        basePrice: "49.90",
        totalEditions: 500,
        availableStock: 500,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoA.id, photoB.id);

    log(`Test interblocage multi-photographes (A+B / B+A) — ${ITERATIONS} itérations (Promise.all)`);
    let mSuccess = 0;
    let mRejected = 0;
    const multiOrderIds: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const orderAB = await createPendingOrder({
        userId: buyerU.id,
        items: [
          { photoId: photoA.id, sizeId: null, mountId: null, qty: 1 },
          { photoId: photoB.id, sizeId: null, mountId: null, qty: 1 },
        ],
        shipping: shippingFor(buyerU),
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        currency: "EUR",
      });
      const orderBA = await createPendingOrder({
        userId: buyerV.id,
        items: [
          { photoId: photoB.id, sizeId: null, mountId: null, qty: 1 },
          { photoId: photoA.id, sizeId: null, mountId: null, qty: 1 },
        ],
        shipping: shippingFor(buyerV),
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        currency: "EUR",
      });
      multiOrderIds.push(orderAB.order.id, orderBA.order.id);
      createdOrderIds.push(orderAB.order.id, orderBA.order.id);
      createdOrderNumbers.push(orderAB.order.orderNumber, orderBA.order.orderNumber);

      const settled = await Promise.allSettled([
        payOrderWithWallet(orderAB.order, buyerU.id),
        payOrderWithWallet(orderBA.order, buyerV.id),
      ]);
      for (const s of settled) {
        if (s.status === "fulfilled") mSuccess++;
        else {
          mRejected++;
          rejectionDetails.push(String(s.reason));
        }
      }
    }

    const d40Multi = (pgErrorCounts["40P01"] ?? 0) - d40BeforeMulti;
    const d40001Multi = (pgErrorCounts["40001"] ?? 0) - d40001BeforeMulti;
    log(`  Interblocages multi-photographes réellement levés : 40P01=${d40Multi}, 40001=${d40001Multi}`);
    log(`  Paiements réussis=${mSuccess}/${2 * ITERATIONS}, rejetés=${mRejected}`);
    check(mSuccess === 2 * ITERATIONS, `multi-photographes : ${mSuccess}/${2 * ITERATIONS} réussis (rejetés=${mRejected})`);
    check(mRejected === 0, `multi-photographes : ${mRejected} paiement(s) rejeté(s) — attendu 0`);

    const multiPaid = (await db.select().from(orders)).filter(
      (o) => multiOrderIds.includes(o.id) && o.status === "paid",
    );
    check(multiPaid.length === 2 * ITERATIONS, `multi-photographes : ${multiPaid.length} commandes "paid" (attendu ${2 * ITERATIONS})`);

    const multiItems = (await db.select().from(orderItems)).filter((i) => multiOrderIds.includes(i.orderId));
    const shareA = multiItems
      .filter((i) => i.photoId === photoA.id && i.photographerShare !== null)
      .reduce((a, i) => a + parseFloat(i.photographerShare as string), 0);
    const shareB = multiItems
      .filter((i) => i.photoId === photoB.id && i.photographerShare !== null)
      .reduce((a, i) => a + parseFloat(i.photographerShare as string), 0);
    const debitU = multiPaid.filter((o) => o.userId === buyerU.id).reduce((a, o) => a + parseFloat(o.total), 0);
    const debitV = multiPaid.filter((o) => o.userId === buyerV.id).reduce((a, o) => a + parseFloat(o.total), 0);

    const [aNow] = await db.select().from(users).where(eq(users.id, photographerA.id));
    const [bNow] = await db.select().from(users).where(eq(users.id, photographerB.id));
    const [uNow] = await db.select().from(users).where(eq(users.id, buyerU.id));
    const [vNow] = await db.select().from(users).where(eq(users.id, buyerV.id));
    const aBal = parseFloat(aNow.availableBalance ?? "0");
    const bBal = parseFloat(bNow.availableBalance ?? "0");
    const uBal = parseFloat(uNow.availableBalance ?? "0");
    const vBal = parseFloat(vNow.availableBalance ?? "0");

    check(Math.abs(aBal - (100000 + shareA)) < 0.01, `multi : solde photographe A cohérent (${aBal.toFixed(2)} = 100000 + ${shareA.toFixed(2)})`);
    check(Math.abs(bBal - (100000 + shareB)) < 0.01, `multi : solde photographe B cohérent (${bBal.toFixed(2)} = 100000 + ${shareB.toFixed(2)})`);
    check(Math.abs(uBal - (100000 - debitU)) < 0.01, `multi : solde acheteur U cohérent (${uBal.toFixed(2)} = 100000 - ${debitU.toFixed(2)})`);
    check(Math.abs(vBal - (100000 - debitV)) < 0.01, `multi : solde acheteur V cohérent (${vBal.toFixed(2)} = 100000 - ${debitV.toFixed(2)})`);

    const [photoANow] = await db.select().from(photos).where(eq(photos.id, photoA.id));
    const [photoBNow] = await db.select().from(photos).where(eq(photos.id, photoB.id));
    const soldA = multiItems.filter((i) => i.photoId === photoA.id).length;
    const soldB = multiItems.filter((i) => i.photoId === photoB.id).length;
    check(photoANow.availableStock === 500 - soldA, `multi : stock A = 500 - ${soldA} (${photoANow.availableStock})`);
    check(photoBNow.availableStock === 500 - soldB, `multi : stock B = 500 - ${soldB} (${photoBNow.availableStock})`);

    let multiCerts = 0;
    for (const i of multiItems) {
      multiCerts += (await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.orderItemId, i.id))).length;
    }
    check(multiCerts === multiItems.length, `multi : 1 certificat par ligne payée (certs=${multiCerts}, lignes=${multiItems.length})`);

    let multiLedger = 0;
    for (const o of multiPaid) {
      multiLedger += (await db.select({ id: walletTransactions.id }).from(walletTransactions).where(eq(walletTransactions.reference, `PRC-${o.orderNumber}`))).length;
    }
    check(multiLedger === multiPaid.length, `multi : 1 ligne ledger par commande payée (ledger=${multiLedger}, payées=${multiPaid.length})`);

    const multiPending = (await db.select().from(orders)).filter((o) => multiOrderIds.includes(o.id) && o.status === "pending").length;
    check(multiPending === 0, `multi : aucune commande laissée "pending" (${multiPending})`);

    log(
      `  OK — A solde ${aBal.toFixed(2)}, B solde ${bBal.toFixed(2)}, U ${uBal.toFixed(2)}, V ${vBal.toFixed(2)}, stocks A=${photoANow.availableStock}/B=${photoBNow.availableStock}, certs=${multiCerts}, ledger=${multiLedger}, aucun pending`,
    );

    const total40 = pgErrorCounts["40P01"] ?? 0;
    const total40001 = pgErrorCounts["40001"] ?? 0;
    log(`  Total interblocages sur tout le run : 40P01=${total40}, 40001=${total40001}`);
    if (total40 + total40001 === 0) {
      log("  OK — aucun interblocage Postgres : le verrouillage trié des users est efficace (retry non nécessaire).");
    } else {
      log(`  INFO — ${total40 + total40001} interblocage(s) rattrapé(s) par withRetry malgré le verrouillage trié.`);
    }

    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT`);
    if (failures > 0) process.exitCode = 1;

    /* Expose le compteur pour les scripts/l'observation externe. */
    (globalThis as Record<string, unknown>).__pgErrorCounts = pgErrorCounts;
  } finally {
    log("Nettoyage des données de test…");
    await cleanup();

    const after = {
      orders: await countRows("orders"),
      certificates: await countRows("certificates"),
      orderItems: await countRows("order_items"),
      walletTransactions: await countRows("wallet_transactions"),
    };
    log(
      `APRÈS — orders=${after.orders}, certificates=${after.certificates}, order_items=${after.orderItems}, wallet_transactions=${after.walletTransactions}`,
    );
    if (
      after.orders !== baseline.orders ||
      after.certificates !== baseline.certificates ||
      after.orderItems !== baseline.orderItems ||
      after.walletTransactions !== baseline.walletTransactions
    ) {
      failures++;
      console.error("[verify-deadlock-xy] ASSERTION FAILED: comptage altéré avant/après");
      process.exitCode = 1;
    } else {
      log("Nettoyage terminé — comptage identique avant/après, aucune donnée résiduelle.");
    }
  }
}

main().catch((err) => {
  console.error("[verify-deadlock-xy] ERREUR :", err);
  process.exitCode = 1;
});
