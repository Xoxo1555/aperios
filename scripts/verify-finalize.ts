/**
 * Vérification jetable des correctifs C2/C3 — idempotence et atomicité de
 * finalizeOrder.
 *
 * 1. Crée un photographe + un acheteur + une photo "limited" de test.
 * 2. Crée une commande PENDING de test via createPendingOrder.
 * 3. Appelle finalizeOrder DEUX fois de suite et vérifie que le stock,
 *    le crédit du photographe, les certificats et la ligne wallet ledger
 *    n'ont été appliqués qu'UNE SEULE fois (2e appel = déjà finalisé sans
 *    rien rejouer).
 * 4. Crée une seconde commande et lance DEUX finalisations concurrentes
 *    (Promise.all) : exactement une gagne, une seule est rejouée.
 * 5. Simule un paiement wallet dont la finalisation échoue APRÈS le débit
 *    (stock volontairement à zéro) : le débit et la finalisation sont dans la
 *    même transaction → le solde du wallet doit rester IDENTIQUE (rollback),
 *    la commande doit rester "pending", sans certificat ni ligne ledger.
 * 6. Digital (completeDigitalOrder) : DEUX appels séquentiels puis DEUX
 *    appels concurrents. Un seul entitlement, downloads +1 par commande,
 *    UN seul crédit photographe par commande, aucun rejeu, statut
 *    "completed", 1 seule ligne wallet ledger par commande.
 * 7. Photo "free" / à stock NULL (illimité) sur le flux d'impression :
 *    finalizeOrderTx ne doit pas tenter de décrément, la finalisation doit
 *    réussir (1 certificat, crédit, ledger) et le 2e appel doit être no-op.
 * 8. Commande qty=2 sur une photo "limited" : exactement 2 order_items
 *    (quantity 1 chacun), numéros d'édition 6 et 7 (sold = total-stock),
 *    2 certificats (un par order_item), stock décrémenté de 2, crédit
 *    photographe = 2 × part unitaire.
 * 9. Affiche avant/pendant/après le nombre de commandes, certificats,
 *    order_items, entitlements et wallet_transactions dans app_db : le
 *    comptage APRÈS nettoyage doit être strictement identique à celui
 *    d'AVANT (aucune donnée de test résiduelle).
 * 10. DEUX paiements wallet CONCURRENTS sur la MÊME commande "pending"
 *    (payOrderWithWallet en Promise.all) : exactement UN débit est committé
 *    (le perdant voit alreadyFinalized:true et sa transaction — débit compris —
 *    est annulée), 1 certificat, 1 ligne ledger, solde du buyer débité une
 *    seule fois. Le paiement wallet transactionnel testé ici est LE MÊME code
 *    de production que la route /api/checkout/wallet.
 *
 * Usage (le `server-only` nécessite le shim NODE_PATH + la condition
 * react-server) :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-finalize.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { randomInt } from "crypto";
import { db } from "../db";
import {
  certificates,
  entitlements,
  orderItems,
  orders,
  photos,
  users,
  walletTransactions,
} from "../db/schema";
import {
  completeDigitalOrder,
  createDigitalOrder,
  createPendingOrder,
  finalizeOrder,
  OrderError,
  payOrderWithWallet,
} from "../lib/orders";
import { round2 } from "../lib/utils";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion. */
assertLocalDatabase();

const stamp = Date.now().toString(36);
const PASSWORD_HASH = "verify-not-used";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-finalize] ${msg}`);

async function countCerts(itemId: number) {
  const rows = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(eq(certificates.orderItemId, itemId));
  return rows.length;
}

async function countLedger(reference: string) {
  const rows = await db
    .select({ id: walletTransactions.id })
    .from(walletTransactions)
    .where(eq(walletTransactions.reference, reference));
  return rows.length;
}

async function countEntitlements(userId: number, photoId: number) {
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.photoId, photoId)));
  return rows.length;
}

/** Le paiement wallet transactionnel (débit + finalisation dans une seule
 *  transaction) est testé via la VRAIE fonction de production
 *  `payOrderWithWallet` de lib/orders.ts — utilisée par la route
 *  /api/checkout/wallet. Plus de miroir local : on exerce exactement le code
 *  de production. */

async function main() {
  const createdOrderIds: number[] = [];
  const createdOrderNumbers: string[] = [];
  const createdPhotoIds: number[] = [];
  const createdUserIds: number[] = [];

  /* ---------- Comptage de référence AVANT ---------- */
  const countBaseline = async () => ({
    orders: (await db.select({ id: orders.id }).from(orders)).length,
    certificates: (await db.select({ id: certificates.id }).from(certificates)).length,
    orderItems: (await db.select({ id: orderItems.id }).from(orderItems)).length,
    entitlements: (await db.select({ id: entitlements.id }).from(entitlements)).length,
    walletTransactions: (await db.select({ id: walletTransactions.id }).from(walletTransactions)).length,
  });

  const baseline = await countBaseline();
  log(`AVANT — orders=${baseline.orders}, certificates=${baseline.certificates}, order_items=${baseline.orderItems}, entitlements=${baseline.entitlements}, wallet_transactions=${baseline.walletTransactions}`);

  const cleanup = async () => {
    for (const id of createdOrderIds) {
      await db.delete(orders).where(eq(orders.id, id)).catch((e) => console.warn("[cleanup] orders", e.message));
    }
    for (const num of createdOrderNumbers) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.reference, `PRC-${num}`))
        .catch((e) => console.warn("[cleanup] ledger", e.message));
    }
    for (const id of createdPhotoIds) {
      await db.delete(photos).where(eq(photos.id, id)).catch((e) => console.warn("[cleanup] photos", e.message));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id)).catch((e) => console.warn("[cleanup] users", e.message));
    }
  };

  try {
    /* ---------- Données de test ---------- */
    const [photographer] = await db
      .insert(users)
      .values({
        name: `Verify Photographer ${stamp}`,
        email: `verify-photog-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "photographer",
      })
      .returning();
    createdUserIds.push(photographer.id);

    const [buyer] = await db
      .insert(users)
      .values({
        name: `Verify Buyer ${stamp}`,
        email: `verify-buyer-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "buyer",
        availableBalance: "1000.00",
      })
      .returning();
    createdUserIds.push(buyer.id);

    const [photo] = await db
      .insert(photos)
      .values({
        title: `Verify Photo ${stamp}`,
        slug: `verify-photo-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photo.id);

    const stock0 = photo.availableStock as number;
    const balance0 = parseFloat(photographer.availableBalance ?? "0");

    const makeOrder = async () => {
      const created = await createPendingOrder({
        userId: buyer.id,
        items: [{ photoId: photo.id, sizeId: null, mountId: null, qty: 1 }],
        shipping: { name: buyer.name, email: buyer.email, address: { city: "Antananarivo" } },
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        currency: "EUR",
      });
      createdOrderIds.push(created.order.id);
      createdOrderNumbers.push(created.order.orderNumber);
      const [item] = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, created.order.id))
        .limit(1);
      return { order: created.order, item };
    };

    /* ---------- Test 1 : deux appels séquentiels ---------- */
    log("Test 1 — deux appels séquentiels");
    const { order: order1, item: item1 } = await makeOrder();
    const share1 = Math.round(parseFloat(item1.lineTotal) * 0.8 * 100) / 100;

    const r1 = await finalizeOrder(order1.orderNumber);
    check(r1.alreadyFinalized === false, "1er appel: alreadyFinalized doit être false");
    check(r1.certificates.length === 1, `1er appel: 1 certificat retourné (${r1.certificates.length})`);

    const r2 = await finalizeOrder(order1.orderNumber);
    check(r2.alreadyFinalized === true, "2e appel: alreadyFinalized doit être true");
    check(r2.certificates.length === 0, "2e appel: aucun certificat rejoué");

    const [photoAfter1] = await db.select().from(photos).where(eq(photos.id, photo.id));
    check(photoAfter1.availableStock === stock0 - 1, `stock décrémenté UNE seule fois (${photoAfter1.availableStock}, attendu ${stock0 - 1})`);
    const [photogAfter1] = await db.select().from(users).where(eq(users.id, photographer.id));
    const balanceAfter1 = parseFloat(photogAfter1.availableBalance ?? "0");
    check(Math.abs(balanceAfter1 - (balance0 + share1)) < 0.001, `crédit photographe UNE seule fois (+${(balanceAfter1 - balance0).toFixed(2)}, attendu +${share1.toFixed(2)})`);
    check((await countCerts(item1.id)) === 1, "1 seul certificat en base");
    check((await countLedger(`PRC-${order1.orderNumber}`)) === 1, "1 seule ligne wallet ledger");
    const [itemAfter1] = await db.select().from(orderItems).where(eq(orderItems.id, item1.id));
    check(itemAfter1.photographerShare === String(share1), `photographerShare enregistré (${itemAfter1.photographerShare})`);
    log(`  OK — 2e appel no-op: stock=${photoAfter1.availableStock}, crédit=+${(balanceAfter1 - balance0).toFixed(2)}, certs=1, ledger=1`);

    /* ---------- Test 2 : deux appels concurrents ---------- */
    log("Test 2 — deux appels concurrents (Promise.all)");
    const { order: order2, item: item2 } = await makeOrder();
    const share2 = Math.round(parseFloat(item2.lineTotal) * 0.8 * 100) / 100;

    const results = await Promise.all([
      finalizeOrder(order2.orderNumber),
      finalizeOrder(order2.orderNumber),
    ]);
    const fresh = results.filter((r) => r.alreadyFinalized === false);
    const already = results.filter((r) => r.alreadyFinalized === true);
    check(fresh.length === 1, `exactement UNE finalisation concurrente a gagné (${fresh.length})`);
    check(already.length === 1, `l'autre appel concurrent doit être « déjà finalisé » (${already.length})`);

    const [photoAfter2] = await db.select().from(photos).where(eq(photos.id, photo.id));
    check(photoAfter2.availableStock === stock0 - 2, `stock décrémenté UNE seule fois par la commande 2 (${photoAfter2.availableStock}, attendu ${stock0 - 2})`);
    const [photogAfter2] = await db.select().from(users).where(eq(users.id, photographer.id));
    const balanceAfter2 = parseFloat(photogAfter2.availableBalance ?? "0");
    check(Math.abs(balanceAfter2 - (balanceAfter1 + share2)) < 0.001, `crédit concurrent UNE seule fois (+${(balanceAfter2 - balanceAfter1).toFixed(2)}, attendu +${share2.toFixed(2)})`);
    check((await countCerts(item2.id)) === 1, "commande 2: 1 seul certificat en base");
    check((await countLedger(`PRC-${order2.orderNumber}`)) === 1, "commande 2: 1 seule ligne ledger");
    log(`  OK — concurrents: 1 fraîche + 1 « déjà finalisée », stock=${photoAfter2.availableStock}, crédit=+${(balanceAfter2 - balanceAfter1).toFixed(2)}, certs=1, ledger=1`);

    /* ---------- Test 3 : échec de finalisation pendant un paiement wallet ---------- */
    log("Test 3 — paiement wallet avec finalisation en échec (rollback du débit)");
    const buyerBalance0 = parseFloat(buyer.availableBalance ?? "0");

    const { order: order3, item: item3 } = await makeOrder();

    /* Simule une rupture de stock survenue entre la création de la commande et
       la confirmation du paiement : la finalisation échouera (409) APRÈS le
       débit du solde — le rollback doit annuler ce débit. */
    await db.update(photos).set({ availableStock: 0 }).where(eq(photos.id, photo.id));

    let walletError: unknown = null;
    try {
      await payOrderWithWallet(order3, buyer.id);
    } catch (err) {
      walletError = err;
    }
    check(walletError instanceof OrderError, `la finalisation wallet doit échouer (OrderError), reçu: ${String(walletError)}`);
    if (walletError instanceof OrderError) {
      check(/Plus assez d'exemplaires/.test(walletError.message), `message d'échec explicite, reçu: "${walletError.message}"`);
    }

    const [buyerAfter] = await db.select().from(users).where(eq(users.id, buyer.id));
    check(
      Math.abs(parseFloat(buyerAfter.availableBalance ?? "0") - buyerBalance0) < 0.001,
      `solde du wallet IDENTIQUE après rollback (${buyerAfter.availableBalance}, attendu ${buyerBalance0.toFixed(2)})`,
    );
    const [order3After] = await db.select().from(orders).where(eq(orders.orderNumber, order3.orderNumber));
    check(order3After.status === "pending", `la commande reste "pending" après rollback (${order3After.status})`);
    check((await countCerts(item3.id)) === 0, "aucun certificat créé (rollback)");
    check((await countLedger(`PRC-${order3.orderNumber}`)) === 0, "aucune ligne wallet ledger (rollback)");
    log("  OK — échec de finalisation => débit annulé, solde wallet inchangé, commande pending, 0 certificat, 0 ledger");

    /* ---------- Test 4 : digital — deux appels séquentiels ---------- */
    log("Test 4 — digital (completeDigitalOrder) : deux appels séquentiels");
    const [photoD] = await db
      .insert(photos)
      .values({
        title: `Verify Digital ${stamp}`,
        slug: `verify-digital-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "29.90",
        totalEditions: null,
        availableStock: null,
        hdPath: "/storage/hd/verify-digital.jpg",
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoD.id);

    const [photoDState0] = await db.select({ d: photos.downloads }).from(photos).where(eq(photos.id, photoD.id));
    const downloadsD0 = photoDState0?.d ?? 0;
    const [photogBalD0] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceD0 = parseFloat(photogBalD0?.b ?? "0");

    const dOrder1 = await createDigitalOrder({
      userId: buyer.id,
      photoId: photoD.id,
      licenseType: "personal",
      paymentProvider: "stripe",
      currency: "EUR",
    });
    createdOrderIds.push(dOrder1.order.id);
    createdOrderNumbers.push(dOrder1.order.orderNumber);
    const dShare1 = round2(parseFloat(dOrder1.item.lineTotal) * (1 - 0.2));

    const dr1 = await completeDigitalOrder(dOrder1.order.orderNumber);
    check(dr1.alreadyFinalized === false, "digital 1er appel: alreadyFinalized doit être false");
    check(dr1.entitlementsCreated === 1, `digital 1er appel: 1 entitlement créé (${dr1.entitlementsCreated})`);

    const dr2 = await completeDigitalOrder(dOrder1.order.orderNumber);
    check(dr2.alreadyFinalized === true, "digital 2e appel: alreadyFinalized doit être true");
    check(dr2.entitlementsCreated === 0, "digital 2e appel: aucun entitlement rejoué");

    check((await countEntitlements(buyer.id, photoD.id)) === 1, "digital: 1 seul entitlement (buyer, photo) en base");
    const [photoDAfter1] = await db.select().from(photos).where(eq(photos.id, photoD.id));
    check((photoDAfter1.downloads ?? 0) === downloadsD0 + 1, `digital: downloads +1 (${photoDAfter1.downloads}, attendu ${downloadsD0 + 1})`);
    const [photogBalD1] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceD1 = parseFloat(photogBalD1?.b ?? "0");
    check(Math.abs(balanceD1 - (balanceD0 + dShare1)) < 0.001, `digital: crédit photographe UNE seule fois (+${(balanceD1 - balanceD0).toFixed(2)}, attendu +${dShare1.toFixed(2)})`);
    check((await countLedger(`PRC-${dOrder1.order.orderNumber}`)) === 1, "digital: 1 seule ligne wallet ledger");
    const [d1Row] = await db.select().from(orders).where(eq(orders.orderNumber, dOrder1.order.orderNumber));
    check(d1Row.status === "completed", `digital: statut "completed" (${d1Row.status})`);
    log(`  OK — digital séquentiel: entitlement=1, downloads=+1, crédit=+${(balanceD1 - balanceD0).toFixed(2)}, statut=${d1Row.status}, ledger=1`);

    /* ---------- Test 5 : digital — deux appels concurrents ---------- */
    log("Test 5 — digital (completeDigitalOrder) : deux appels concurrents (Promise.all)");
    const dOrder2 = await createDigitalOrder({
      userId: buyer.id,
      photoId: photoD.id,
      licenseType: "personal",
      paymentProvider: "stripe",
      currency: "EUR",
    });
    createdOrderIds.push(dOrder2.order.id);
    createdOrderNumbers.push(dOrder2.order.orderNumber);
    const dShare2 = round2(parseFloat(dOrder2.item.lineTotal) * (1 - 0.2));

    const dResults = await Promise.all([
      completeDigitalOrder(dOrder2.order.orderNumber),
      completeDigitalOrder(dOrder2.order.orderNumber),
    ]);
    const dFresh = dResults.filter((r) => r.alreadyFinalized === false);
    const dAlready = dResults.filter((r) => r.alreadyFinalized === true);
    check(dFresh.length === 1, `digital concurrent: exactement UNE finalisation a gagné (${dFresh.length})`);
    check(dAlready.length === 1, `digital concurrent: l'autre appel doit être « déjà finalisée » (${dAlready.length})`);

    check((await countEntitlements(buyer.id, photoD.id)) === 1, "digital concurrent: toujours 1 seul entitlement (aucun doublon)");
    const [photoDAfter2] = await db.select().from(photos).where(eq(photos.id, photoD.id));
    check((photoDAfter2.downloads ?? 0) === downloadsD0 + 2, `digital concurrent: downloads +1 seulement (${photoDAfter2.downloads}, attendu ${downloadsD0 + 2})`);
    const [photogBalD2] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceD2 = parseFloat(photogBalD2?.b ?? "0");
    check(Math.abs(balanceD2 - (balanceD1 + dShare2)) < 0.001, `digital concurrent: crédit UNE seule fois (+${(balanceD2 - balanceD1).toFixed(2)}, attendu +${dShare2.toFixed(2)})`);
    check((await countLedger(`PRC-${dOrder2.order.orderNumber}`)) === 1, "digital concurrent: 1 seule ligne wallet ledger");
    log(`  OK — digital concurrent: 1 fraîche + 1 « déjà finalisée », entitlement=1, downloads=${photoDAfter2.downloads}, crédit=+${(balanceD2 - balanceD1).toFixed(2)}, ledger=1`);

    /* ---------- Test 6 : photo "free" / à stock NULL (illimité) ---------- */
    log("Test 6 — photo sans stock (availableStock NULL / illimité) : aucun décrément tenté, finalisation OK");
    const [photoF] = await db
      .insert(photos)
      .values({
        title: `Verify Free ${stamp}`,
        slug: `verify-free-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "portrait",
        licenseType: "free",
        photographerId: photographer.id,
        basePrice: "25.00",
        totalEditions: null,
        availableStock: null,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoF.id);

    /* createPendingOrder refuse les photos "free"/sans stock dans le flux
       d'impression (où license_type doit être "limited" et stock >= qty) : on
       insère donc la commande PENDING directement pour exercer la garde de
       finalizeOrderTx (`if (photo.availableStock !== null)`). */
    const [orderF] = await db
      .insert(orders)
      .values({
        orderNumber: `APR-${new Date().getFullYear()}-${randomInt(100000, 999999)}`,
        userId: buyer.id,
        status: "pending",
        subtotal: "25.00",
        shipping: "0",
        tax: "0",
        total: "25.00",
        currency: "EUR",
        paymentMethod: "wallet",
        paymentProvider: "wallet",
        shipName: buyer.name,
        shipEmail: buyer.email,
        shipAddress: { city: "Antananarivo" },
      })
      .returning();
    createdOrderIds.push(orderF.id);
    createdOrderNumbers.push(orderF.orderNumber);
    const [itemF] = await db
      .insert(orderItems)
      .values({
        orderId: orderF.id,
        photoId: photoF.id,
        quantity: 1,
        unitPrice: "25.00",
        lineTotal: "25.00",
      })
      .returning();
    const fShare = round2(parseFloat(itemF.lineTotal) * (1 - 0.2));

    const rf1 = await finalizeOrder(orderF.orderNumber);
    check(rf1.alreadyFinalized === false, "free/NULL: finalisation OK (1er appel)");
    check(rf1.certificates.length === 1, "free/NULL: 1 certificat retourné");
    const [photoFAfter] = await db.select().from(photos).where(eq(photos.id, photoF.id));
    check(photoFAfter.availableStock === null, "free/NULL: AUCUN décrément tenté (stock reste NULL)");
    check((await countCerts(itemF.id)) === 1, "free/NULL: 1 seul certificat en base");
    const [photogBalF] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceF = parseFloat(photogBalF?.b ?? "0");
    check(Math.abs(balanceF - (balanceD2 + fShare)) < 0.001, `free/NULL: crédit photographe (+${(balanceF - balanceD2).toFixed(2)}, attendu +${fShare.toFixed(2)})`);
    check((await countLedger(`PRC-${orderF.orderNumber}`)) === 1, "free/NULL: 1 seule ligne ledger");
    const [orderFAfter] = await db.select().from(orders).where(eq(orders.orderNumber, orderF.orderNumber));
    check(orderFAfter.status === "paid", `free/NULL: statut "paid" (${orderFAfter.status})`);

    const rf2 = await finalizeOrder(orderF.orderNumber);
    check(rf2.alreadyFinalized === true, "free/NULL 2e appel: déjà finalisée");
    log("  OK — free/NULL: stock inchangé=NULL, cert=1, crédit=+25.00-20%, ledger=1, statut=paid, 2e appel no-op");

    /* ---------- Test 7 : qty=2 sur une photo "limited" ---------- */
    log("Test 7 — qty=2 sur édition limitée : certificate et numéros d'édition");
    const [photoQ] = await db
      .insert(photos)
      .values({
        title: `Verify Qty ${stamp}`,
        slug: `verify-qty-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "square",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "50.00",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoQ.id);
    const qStock0 = photoQ.availableStock as number;

    const qCreated = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoQ.id, sizeId: null, mountId: null, qty: 2 }],
      shipping: { name: buyer.name, email: buyer.email, address: { city: "Antananarivo" } },
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(qCreated.order.id);
    createdOrderNumbers.push(qCreated.order.orderNumber);

    const qItems = await db.select().from(orderItems).where(eq(orderItems.orderId, qCreated.order.id));
    check(qItems.length === 2, `qty=2 => 2 order_items (${qItems.length})`);
    check(qItems.every((i) => i.quantity === 1), "chaque order_item a quantity=1");
    /* Le numéro d'édition n'est PLUS réservé à la création : il doit rester
       NULL tant que la commande est "pending" (attribution à la finalisation,
       sous verrou de ligne, pour éliminer la course du checkout). */
    check(qItems.every((i) => i.editionNumber === null), "pending: edition_number NULL avant finalisation");
    const qShareEach = round2(parseFloat(qItems[0].lineTotal) * (1 - 0.2));
    const [photogBalQ0] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceQ0 = parseFloat(photogBalQ0?.b ?? "0");

    const rq = await finalizeOrder(qCreated.order.orderNumber);
    check(rq.alreadyFinalized === false, "qty=2: finalisation OK");
    check(rq.certificates.length === 2, `qty=2: 2 certificats retournés (${rq.certificates.length})`);
    let qCertsTotal = 0;
    for (const it of qItems) {
      const c = await countCerts(it.id);
      check(c === 1, `qty=2: 1 certificat par order_item (item ${it.id}: ${c})`);
      qCertsTotal += c;
    }
    check(qCertsTotal === 2, `qty=2: 2 certificats en base (${qCertsTotal})`);
    /* Attribution à la finalisation : deux numéros DISTINCTS et consécutifs
       (sold = total - stock = 5 → 6 puis 7), jamais deux fois le même. */
    const qItemsAfter = await db.select().from(orderItems).where(eq(orderItems.orderId, qCreated.order.id));
    const qEditions = qItemsAfter.map((i) => i.editionNumber as number).sort((a, b) => a - b);
    check(
      qEditions.length === 2 && qEditions[0] === 6 && qEditions[1] === 7,
      `n° d'édition 6 et 7 attendus après finalisation (sold = ${photoQ.totalEditions} - ${qStock0} = 5) — reçus: ${qEditions.join(",")}`,
    );
    const [photoQAfter] = await db.select().from(photos).where(eq(photos.id, photoQ.id));
    check(photoQAfter.availableStock === qStock0 - 2, `qty=2: stock décrémenté de 2 (${photoQAfter.availableStock}, attendu ${qStock0 - 2})`);
    const [photogBalQ1] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, photographer.id))
      .limit(1);
    const balanceQ1 = parseFloat(photogBalQ1?.b ?? "0");
    const expectedQ = round2(qShareEach * 2);
    check(Math.abs(balanceQ1 - (balanceQ0 + expectedQ)) < 0.001, `qty=2: crédit = 2 × part (+${(balanceQ1 - balanceQ0).toFixed(2)}, attendu +${expectedQ.toFixed(2)})`);
    check((await countLedger(`PRC-${qCreated.order.orderNumber}`)) === 1, "qty=2: 1 seule ligne ledger");
    log(`  OK — qty=2: ${qCertsTotal} certificats, éditions ${qEditions.join(" et ")}, stock=${photoQAfter.availableStock}, crédit=+${(balanceQ1 - balanceQ0).toFixed(2)}, ledger=1`);

    /* ---------- Test 8 : DEUX paiements wallet CONCURRENTS sur le MÊME ordre pending ---------- */
    log("Test 8 — 2 paiements wallet concurrents sur le même ordre pending : UN SEUL débit");
    const [photoW] = await db
      .insert(photos)
      .values({
        title: `Verify Wallet Concurrent ${stamp}`,
        slug: `verify-wallet-concurrent-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "portrait",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoW.id);
    const wStock0 = photoW.availableStock as number;

    const wCreated = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoW.id, sizeId: null, mountId: null, qty: 1 }],
      shipping: { name: buyer.name, email: buyer.email, address: { city: "Antananarivo" } },
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(wCreated.order.id);
    createdOrderNumbers.push(wCreated.order.orderNumber);
    const [wItem] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, wCreated.order.id))
      .limit(1);

    const [buyerBalW0] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, buyer.id))
      .limit(1);
    const balW0 = parseFloat(buyerBalW0?.b ?? "0");
    const wTotal = parseFloat(wCreated.order.total);

    /* Le solde du buyer couvre bien DEUX totaux : sans la correction, les deux
       appels débiteraient. Le sentinelle de payOrderWithWallet doit annuler le
       débit du perdant (rollback) — un seul débit net, une seule vente. */
    check(balW0 >= 2 * wTotal, `solde de départ assez élevé pour prouver le double débit potentiel (${balW0.toFixed(2)} >= ${(2 * wTotal).toFixed(2)})`);

    const wResults = await Promise.all([
      payOrderWithWallet(wCreated.order, buyer.id),
      payOrderWithWallet(wCreated.order, buyer.id),
    ]);
    const wFresh = wResults.filter((r) => r.alreadyFinalized === false);
    const wAlready = wResults.filter((r) => r.alreadyFinalized === true);
    check(wFresh.length === 1, `exactement UN paiement concurrent a gagné (${wFresh.length})`);
    check(wAlready.length === 1, `l'autre paiement concurrent doit être « déjà finalisé » (${wAlready.length})`);

    const [buyerBalW1] = await db
      .select({ b: users.availableBalance })
      .from(users)
      .where(eq(users.id, buyer.id))
      .limit(1);
    const balW1 = parseFloat(buyerBalW1?.b ?? "0");
    check(
      Math.abs(balW1 - (balW0 - wTotal)) < 0.001,
      `solde débité UNE seule fois (${(balW0 - balW1).toFixed(2)}, attendu ${wTotal.toFixed(2)})`,
    );
    const [orderWAfter] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, wCreated.order.orderNumber));
    check(orderWAfter.status === "paid", `statut final "paid" (${orderWAfter.status})`);
    const [photoWAfter] = await db.select().from(photos).where(eq(photos.id, photoW.id));
    check(photoWAfter.availableStock === wStock0 - 1, `stock décrémenté UNE seule fois (${photoWAfter.availableStock}, attendu ${wStock0 - 1})`);
    check((await countCerts(wItem.id)) === 1, "1 seul certificat (aucun doublon)");
    check((await countLedger(`PRC-${wCreated.order.orderNumber}`)) === 1, "1 seule ligne ledger (aucun doublon)");
    log(`  OK — UN débit de ${wTotal.toFixed(2)} (solde ${balW0.toFixed(2)} → ${balW1.toFixed(2)}), statut=${orderWAfter.status}, stock=${photoWAfter.availableStock}, certs=1, ledger=1`);

    /* ================================================================== */
    /*  C5 — numéro d'édition : plus de course, unicité garantie           */
    /* ================================================================== */
    const settle = async <T>(p: Promise<T>) => {
      try {
        return { ok: true as const, value: await p };
      } catch (error) {
        return { ok: false as const, error };
      }
    };
    const orderEditions = async (orderId: number) =>
      (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)))
        .map((i) => i.editionNumber)
        .sort((a, b) => (a ?? -1) - (b ?? -1));
    const shipping = { name: buyer.name, email: buyer.email, address: { city: "Antananarivo" } };

    /* ---------- C5-a : 2 commandes pending sur la MÊME photo ---------- */
    log("Test C5-a — 2 commandes sur la MÊME photo finalisées en concurrence : numéros DISTINCTS, stock -2");
    const [photoA] = await db
      .insert(photos)
      .values({
        title: `Verify Edition A ${stamp}`,
        slug: `verify-edition-a-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoA.id);
    const aStock0 = photoA.availableStock as number;

    const a1 = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoA.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    const a2 = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoA.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(a1.order.id, a2.order.id);
    createdOrderNumbers.push(a1.order.orderNumber, a2.order.orderNumber);

    check(
      (await orderEditions(a1.order.id)).every((e) => e === null),
      "C5-a: les deux numéros sont NULL avant finalisation",
    );

    const aResults = await Promise.all([
      finalizeOrder(a1.order.orderNumber),
      finalizeOrder(a2.order.orderNumber),
    ]);
    check(aResults.every((r) => r.alreadyFinalized === false), "C5-a: les DEUX finalisations gagnent");

    const aEds = [...(await orderEditions(a1.order.id)), ...(await orderEditions(a2.order.id))];
    check(aEds.length === 2 && aEds.every((e) => e !== null), `C5-a: 2 numéros attribués (${aEds.join(",")})`);
    check(new Set(aEds).size === 2, `C5-a: les numéros sont DISTINCTS (${aEds.join(",")})`);
    check(aEds[0] === 6 && aEds[1] === 7, `C5-a: numéros 6 et 7 (sold=5) — reçus ${aEds.join(",")}`);
    const [photoAAfter] = await db.select().from(photos).where(eq(photos.id, photoA.id));
    check(photoAAfter.availableStock === aStock0 - 2, `C5-a: stock décrémenté de 2 (${photoAAfter.availableStock}, attendu ${aStock0 - 2})`);
    log(`  OK — C5-a: éditions ${aEds.join(" et ")}, stock ${aStock0}→${photoAAfter.availableStock}`);

    /* ---------- C5-b : stock=1, 2 finalisations concurrentes ---------- */
    log("Test C5-b — stock=1, 2 finalisations concurrentes : UNE gagne, l'autre échoue proprement (rollback complet)");
    const [photoB] = await db
      .insert(photos)
      .values({
        title: `Verify Edition B ${stamp}`,
        slug: `verify-edition-b-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "portrait",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 5,
        availableStock: 1,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoB.id);

    const b1 = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoB.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    const b2 = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoB.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(b1.order.id, b2.order.id);
    createdOrderNumbers.push(b1.order.orderNumber, b2.order.orderNumber);

    const bSettled = await Promise.all([
      settle(finalizeOrder(b1.order.orderNumber)),
      settle(finalizeOrder(b2.order.orderNumber)),
    ]);
    const bWins = bSettled.filter((r) => r.ok);
    const bLosses = bSettled.filter((r) => !r.ok);
    check(bWins.length === 1, `C5-b: exactement UNE finalisation gagne (${bWins.length})`);
    check(bLosses.length === 1, `C5-b: exactement UNE finalisation échoue (${bLosses.length})`);
    const bLose = bLosses[0];
    if (!bLose.ok) {
      check(bLose.error instanceof OrderError, `C5-b: échec = OrderError explicite (reçu ${String(bLose.error)})`);
      if (bLose.error instanceof OrderError) check(bLose.error.status === 409, `C5-b: statut 409 (reçu ${bLose.error.status})`);
    }
    const bWinIdx = bSettled.findIndex((r) => r.ok);
    const bWinOrder = [b1.order, b2.order][bWinIdx];
    const bLoseOrder = [b1.order, b2.order][bWinIdx === 0 ? 1 : 0];
    const [bLoseRow] = await db.select().from(orders).where(eq(orders.orderNumber, bLoseOrder.orderNumber));
    check(bLoseRow.status === "pending", `C5-b: la perdante reste "pending" (${bLoseRow.status})`);
    const [bWinRow] = await db.select().from(orders).where(eq(orders.orderNumber, bWinOrder.orderNumber));
    check(bWinRow.status === "paid", `C5-b: la gagnante est "paid" (${bWinRow.status})`);
    const [photoBAfter] = await db.select().from(photos).where(eq(photos.id, photoB.id));
    check(photoBAfter.availableStock === 0, `C5-b: stock à 0 (${photoBAfter.availableStock})`);
    const bCerts = (await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.photoId, photoB.id))).length;
    check(bCerts === 1, `C5-b: 1 SEUL certificat au total (${bCerts})`);
    const bLedger = (await countLedger(`PRC-${b1.order.orderNumber}`)) + (await countLedger(`PRC-${b2.order.orderNumber}`));
    check(bLedger === 1, `C5-b: 1 SEULE ligne ledger (${bLedger})`);
    const bEds = await orderEditions(bWinOrder.id);
    check(bEds.length === 1 && bEds[0] === 5, `C5-b: édition 5 pour la gagnante (sold=4) — reçu ${bEds.join(",")}`);
    log(`  OK — C5-b: gagnante paid/édition ${bEds[0]}, perdante pending, stock=0, certs=1, ledger=1, échec 409`);

    /* ---------- C5-b (wallet) : le perdant n'est PAS débité ---------- */
    log("Test C5-b wallet — stock=1, 2 paiements wallet concurrents : UN SEUL débit, perdant non débité");
    const [buyer2] = await db
      .insert(users)
      .values({
        name: `Verify Buyer2 ${stamp}`,
        email: `verify-buyer2-${stamp}@aperio.test`,
        passwordHash: PASSWORD_HASH,
        role: "buyer",
        availableBalance: "500.00",
      })
      .returning();
    createdUserIds.push(buyer2.id);

    const [photoC] = await db
      .insert(photos)
      .values({
        title: `Verify Edition C ${stamp}`,
        slug: `verify-edition-c-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "square",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 5,
        availableStock: 1,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoC.id);

    const c1 = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoC.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    const c2 = await createPendingOrder({
      userId: buyer2.id,
      items: [{ photoId: photoC.id, sizeId: null, mountId: null, qty: 1 }],
      shipping: { name: buyer2.name, email: buyer2.email, address: { city: "Antananarivo" } },
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(c1.order.id, c2.order.id);
    createdOrderNumbers.push(c1.order.orderNumber, c2.order.orderNumber);

    const [buyerBalC0Row] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer.id));
    const [buyer2BalC0Row] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer2.id));
    const cBal0 = parseFloat(buyerBalC0Row.b ?? "0");
    const cBal20 = parseFloat(buyer2BalC0Row.b ?? "0");

    const cSettled = await Promise.all([
      settle(payOrderWithWallet(c1.order, buyer.id)),
      settle(payOrderWithWallet(c2.order, buyer2.id)),
    ]);
    check(cSettled.filter((r) => r.ok).length === 1, `C5-b wallet: exactement UN paiement gagne (${cSettled.filter((r) => r.ok).length})`);

    const [buyerBalC1Row] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer.id));
    const [buyer2BalC1Row] = await db.select({ b: users.availableBalance }).from(users).where(eq(users.id, buyer2.id));
    const debitBuyer = cBal0 - parseFloat(buyerBalC1Row.b ?? "0");
    const debitBuyer2 = cBal20 - parseFloat(buyer2BalC1Row.b ?? "0");
    const cTotal = parseFloat(c1.order.total);
    check(
      Math.abs(debitBuyer + debitBuyer2 - cTotal) < 0.001,
      `C5-b wallet: UN SEUL débit net (${(debitBuyer + debitBuyer2).toFixed(2)}, attendu ${cTotal.toFixed(2)})`,
    );
    check(Math.abs(debitBuyer) < 0.001 || Math.abs(debitBuyer - cTotal) < 0.001, `C5-b wallet: buyer débité 0 ou 1 fois (${debitBuyer.toFixed(2)})`);
    check(Math.abs(debitBuyer2) < 0.001 || Math.abs(debitBuyer2 - cTotal) < 0.001, `C5-b wallet: buyer2 débité 0 ou 1 fois (${debitBuyer2.toFixed(2)})`);
    const [photoCAfter] = await db.select().from(photos).where(eq(photos.id, photoC.id));
    check(photoCAfter.availableStock === 0, `C5-b wallet: stock à 0 (${photoCAfter.availableStock})`);
    const cLedger = (await countLedger(`PRC-${c1.order.orderNumber}`)) + (await countLedger(`PRC-${c2.order.orderNumber}`));
    check(cLedger === 1, `C5-b wallet: 1 SEULE ligne ledger (${cLedger})`);
    log(`  OK — C5-b wallet: débits ${debitBuyer.toFixed(2)}+${debitBuyer2.toFixed(2)}=${cTotal.toFixed(2)}, stock=0, ledger=1`);

    /* ---------- C5-deadlock : photos partagées, ordre inverse ---------- */
    log("Test C5-deadlock — 2 commandes [P,Q] / [Q,P] finalisées en concurrence : aucun interblocage, aucun état partiel");
    const [photoP] = await db
      .insert(photos)
      .values({
        title: `Verify Edition P ${stamp}`,
        slug: `verify-edition-p-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "39.90",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    const [photoQ2] = await db
      .insert(photos)
      .values({
        title: `Verify Edition Q ${stamp}`,
        slug: `verify-edition-q-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "39.90",
        totalEditions: 10,
        availableStock: 5,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoP.id, photoQ2.id);

    const d1 = await createPendingOrder({
      userId: buyer.id,
      items: [
        { photoId: photoP.id, sizeId: null, mountId: null, qty: 1 },
        { photoId: photoQ2.id, sizeId: null, mountId: null, qty: 1 },
      ],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    const d2 = await createPendingOrder({
      userId: buyer.id,
      items: [
        { photoId: photoQ2.id, sizeId: null, mountId: null, qty: 1 },
        { photoId: photoP.id, sizeId: null, mountId: null, qty: 1 },
      ],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(d1.order.id, d2.order.id);
    createdOrderNumbers.push(d1.order.orderNumber, d2.order.orderNumber);

    const dlResults = await Promise.all([
      finalizeOrder(d1.order.orderNumber),
      finalizeOrder(d2.order.orderNumber),
    ]);
    check(dlResults.every((r) => r.alreadyFinalized === false), "C5-deadlock: les DEUX finalisations réussissent");
    const dItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, [d1.order.id, d2.order.id]));
    const pEds = dItems.filter((i) => i.photoId === photoP.id).map((i) => i.editionNumber).sort((a, b) => (a ?? -1) - (b ?? -1));
    const qEds = dItems.filter((i) => i.photoId === photoQ2.id).map((i) => i.editionNumber).sort((a, b) => (a ?? -1) - (b ?? -1));
    check(pEds.length === 2 && pEds[0] === 6 && pEds[1] === 7, `C5-deadlock: P reçoit 6 et 7, distincts (${pEds.join(",")})`);
    check(qEds.length === 2 && qEds[0] === 6 && qEds[1] === 7, `C5-deadlock: Q reçoit 6 et 7, distincts (${qEds.join(",")})`);
    const [photoPAfter] = await db.select().from(photos).where(eq(photos.id, photoP.id));
    const [photoQ2After] = await db.select().from(photos).where(eq(photos.id, photoQ2.id));
    check(photoPAfter.availableStock === 3 && photoQ2After.availableStock === 3, `C5-deadlock: stock P=${photoPAfter.availableStock}, Q=${photoQ2After.availableStock} (attendu 3,3)`);
    log(`  OK — C5-deadlock: P éditions ${pEds.join(",")}, Q éditions ${qEds.join(",")}, stocks 3/3, les deux paid`);

    /* ---------- C5-orphan : échec des lignes => aucune commande ---------- */
    log("Test C5-orphan — échec d'insertion d'une ligne : AUCUNE commande pending orpheline (atomicité)");
    const orphanNum = `APR-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
    let orphanErr: unknown = null;
    try {
      await db.transaction(async (txn) => {
        const [o] = await txn
          .insert(orders)
          .values({
            orderNumber: orphanNum,
            userId: buyer.id,
            status: "pending",
            subtotal: "0",
            shipping: "0",
            tax: "0",
            total: "0",
            currency: "EUR",
            paymentMethod: "wallet",
            paymentProvider: "wallet",
          })
          .returning();
        // photo_id inexistant → violation de clé étrangère : simule l'échec de
        // l'insertion d'une ligne APRÈS l'insertion de la commande.
        // createPendingOrder enveloppe EXACTEMENT ces deux insertions dans une
        // seule db.transaction : l'échec doit tout annuler.
        await txn
          .insert(orderItems)
          .values({ orderId: o.id, photoId: -999999, quantity: 1, unitPrice: "0", lineTotal: "0" });
      });
    } catch (err) {
      orphanErr = err;
    }
    check(orphanErr !== null, "C5-orphan: l'insertion invalide a bien échoué (rollback attendu)");
    const orphanRows = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orphanNum));
    check(orphanRows.length === 0, `C5-orphan: aucune commande orpheline (trouvé ${orphanRows.length})`);
    const danglingItems = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.photoId, -999999));
    check(danglingItems.length === 0, "C5-orphan: aucune ligne order_items orpheline");
    log("  OK — C5-orphan: commande et lignes annulées ensemble (transaction unique)");

    /* ---------- C5-collision : 23505 sur (photo_id, edition_number) => OrderError ---------- */
    log("Test C5-collision — index unique (photo_id, edition_number) violé : OrderError explicite + rollback complet");
    const [photoE] = await db
      .insert(photos)
      .values({
        title: `Verify Edition E ${stamp}`,
        slug: `verify-edition-e-${stamp}`,
        imageUrl: "/images/isalo.jpg",
        orientation: "landscape",
        licenseType: "limited",
        photographerId: photographer.id,
        basePrice: "49.90",
        totalEditions: 5,
        availableStock: 1,
        isPublished: true,
      })
      .returning();
    createdPhotoIds.push(photoE.id);

    /* Commande "empoisonnée" : on lui attribue manuellement le numéro 5 que la
       commande suivante calculera (stock 1, total 5 → sold 4 → prochain = 5).
       Cela force une violation de l'index unique au moment de la finalisation. */
    const ePoison = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoE.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(ePoison.order.id);
    const [ePoisonItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, ePoison.order.id));
    await db.update(orderItems).set({ editionNumber: 5 }).where(eq(orderItems.id, ePoisonItem.id));

    const eReal = await createPendingOrder({
      userId: buyer.id,
      items: [{ photoId: photoE.id, sizeId: null, mountId: null, qty: 1 }],
      shipping,
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: "EUR",
    });
    createdOrderIds.push(eReal.order.id);
    createdOrderNumbers.push(eReal.order.orderNumber);
    const [eRealItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, eReal.order.id));

    let collisionErr: unknown = null;
    try {
      await finalizeOrder(eReal.order.orderNumber);
    } catch (err) {
      collisionErr = err;
    }
    check(collisionErr instanceof OrderError, `C5-collision: OrderError explicite (reçu ${String(collisionErr)})`);
    if (collisionErr instanceof OrderError) {
      check(collisionErr.status === 409, `C5-collision: statut 409 (reçu ${collisionErr.status})`);
      check(/Conflit sur le numéro d'édition/.test(collisionErr.message), `C5-collision: message explicite, reçu "${collisionErr.message}"`);
    }
    const [photoEAfter] = await db.select().from(photos).where(eq(photos.id, photoE.id));
    check(photoEAfter.availableStock === 1, `C5-collision: stock restauré à 1 par le rollback (${photoEAfter.availableStock})`);
    const [eRealOrderAfter] = await db.select().from(orders).where(eq(orders.orderNumber, eReal.order.orderNumber));
    check(eRealOrderAfter.status === "pending", `C5-collision: commande reste "pending" (${eRealOrderAfter.status})`);
    const [eRealItemAfter] = await db.select().from(orderItems).where(eq(orderItems.id, eRealItem.id));
    check(eRealItemAfter.editionNumber === null, `C5-collision: numéro du perdant NON écrit (${eRealItemAfter.editionNumber})`);
    check((await countCerts(eRealItem.id)) === 0, "C5-collision: aucun certificat (rollback)");
    check((await countLedger(`PRC-${eReal.order.orderNumber}`)) === 0, "C5-collision: aucune ligne ledger (rollback)");
    log("  OK — C5-collision: 23505 converti en OrderError 409, rollback intégral, aucun reçu émis");

    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    log("Nettoyage des données de test…");
    await cleanup();

    /* ---------- Comptage APRÈS nettoyage : identique à AVANT ---------- */
    const after = await countBaseline();
    log(`APRÈS — orders=${after.orders}, certificates=${after.certificates}, order_items=${after.orderItems}, entitlements=${after.entitlements}, wallet_transactions=${after.walletTransactions}`);
    if (
      after.orders !== baseline.orders ||
      after.certificates !== baseline.certificates ||
      after.orderItems !== baseline.orderItems ||
      after.entitlements !== baseline.entitlements ||
      after.walletTransactions !== baseline.walletTransactions
    ) {
      failures++;
      console.error(
        `[verify-finalize] ASSERTION FAILED: comptage altéré (avant orders=${baseline.orders}, certs=${baseline.certificates}, oi=${baseline.orderItems}, ents=${baseline.entitlements}, wt=${baseline.walletTransactions} | après orders=${after.orders}, certs=${after.certificates}, oi=${after.orderItems}, ents=${after.entitlements}, wt=${after.walletTransactions})`,
      );
      process.exitCode = 1;
    } else {
      log("Nettoyage terminé — comptage identique avant/après, aucune donnée résiduelle.");
    }
  }
}

main().catch((err) => {
  console.error("[verify-finalize] ERREUR :", err);
  process.exitCode = 1;
});