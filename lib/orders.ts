import "server-only";
import { and, asc, eq, gte, gt, inArray, isNull, sql } from "drizzle-orm";
import { randomBytes, randomInt } from "crypto";
import { db } from "db";
import {
  certificates,
  entitlements,
  mounts,
  orderItems,
  orders,
  photos,
  printsConfig,
  users,
  walletTransactions,
} from "db/schema";
import type { RefundReason } from "db/schema";
import { computeTotals, computeUnitPrice } from "./pricing";
import { refundStripeCharge } from "./payments/stripe";
import { normalizeWalletPaymentMethod } from "./wallet";
import { isRetryablePgError, isUniqueViolation } from "./pg-errors";

/** Minimal transactional client — structurally compatible with both the
 *  module-level `db` and the callback of `db.transaction(...)`. */
type OrderTx = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
  delete: typeof db.delete;
  execute: typeof db.execute;
};

/** Aperio keeps 20% commission on limited-edition print sales; the photographer
 *  receives the remaining 80%, credited to their available balance as soon as
 *  the order is confirmed paid. */
export const PLATFORM_COMMISSION_RATE = 0.2;

/** Statuses that count as a REALIZED sale (the money was collected AND the
 *  order fulfilled). `pending`/`cancelled` are not sales yet, and
 *  `refund_pending`/`refunded` must NEVER count as sales (I6 amendment 11). */
export const SALE_STATUSES = ["paid", "shipped", "delivered", "completed"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export function isSaleStatus(status: string | null | undefined): boolean {
  return !!status && (SALE_STATUSES as readonly string[]).includes(status);
}

export interface CheckoutLine {
  photoId: number;
  sizeId: number | null;
  mountId: number | null;
  qty: number;
}

export interface ShippingInfo {
  name: string;
  email: string;
  address: Record<string, unknown>;
}

/**
 * Validates the cart against the database (never trusts client-sent prices),
 * reserves the requested editions, and creates a PENDING order + order items.
 * The order is only marked "paid" once a real payment confirmation is
 * received (Stripe webhook, Mobile Money callback, or admin reconciliation).
 */
export async function createPendingOrder(opts: {
  userId: number;
  items: CheckoutLine[];
  shipping: ShippingInfo;
  paymentMethod: string;
  paymentProvider: string;
  /** Display/payment currency selected by the buyer (does not change the
   *  canonical EUR amounts stored on the order — only the recorded currency). */
  currency?: string;
  /** Idempotency-Key (UUID) supplied by the client for wallet checkouts: at
   *  most ONE pending order can exist per (user, key). */
  idempotencyKey?: string;
}) {
  const { userId, items, shipping, paymentMethod, paymentProvider, currency = "EUR", idempotencyKey } = opts;
  if (items.length === 0) throw new OrderError("Votre panier est vide.", 400);
  if (!shipping.name || !shipping.email || !shipping.address) {
    throw new OrderError("Les coordonnées de livraison sont requises.", 400);
  }

  const photoIds = [...new Set(items.map((i) => i.photoId))];
  const photoRows = await db
    .select()
    .from(photos)
    .where(and(inArray(photos.id, photoIds), eq(photos.licenseType, "limited"), eq(photos.isPublished, true)));
  const photoMap = new Map(photoRows.map((p) => [p.id, p]));

  const sizeRows = await db.select().from(printsConfig);
  const sizeMap = new Map(sizeRows.map((s) => [s.id, s]));
  const mountRows = await db.select().from(mounts);
  const mountMap = new Map(mountRows.map((m) => [m.id, m]));

  const lines: Array<{
    photoId: number;
    photographerId: number;
    printConfigId: number | null;
    mountId: number | null;
    unitPrice: number;
  }> = [];

  for (const item of items) {
    const photo = photoMap.get(item.photoId);
    if (!photo) throw new OrderError("Un des tirages sélectionnés n'est plus disponible.", 400);
    const size = item.sizeId ? sizeMap.get(item.sizeId) : undefined;
    const mount = item.mountId ? mountMap.get(item.mountId) : undefined;
    const qty = Math.min(10, Math.max(1, item.qty || 1));

    const available = photo.availableStock ?? 0;
    if (available < qty) {
      throw new OrderError(`Plus assez d'exemplaires disponibles pour « ${photo.title} » (${available} restants).`, 409);
    }
    const unitPrice = computeUnitPrice(photo.basePrice, size?.multiplier ?? "1", mount?.multiplier ?? "1", mount?.surcharge ?? "0");
    for (let i = 0; i < qty; i++) {
      lines.push({
        photoId: photo.id,
        photographerId: photo.photographerId,
        printConfigId: size?.id ?? null,
        mountId: mount?.id ?? null,
        unitPrice,
      });
    }
  }

  const totals = computeTotals(lines.map((l) => ({ unitPrice: l.unitPrice, qty: 1 })));
  const orderNumber = `APR-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;

  /* Commande + lignes créées dans UNE SEULE transaction : aucun ordre
   * "pending" orphelin ne peut survivre à un échec d'insertion des lignes.
   * La violation d'unicité sur (user_id, idempotency_key) se propage telle
   * quelle jusqu'à la route, qui la rejoue (comportement inchangé). */
  const [order] = await db.transaction(async (txn) => {
    const [created] = await txn
      .insert(orders)
      .values({
        orderNumber,
        userId,
        status: "pending",
        subtotal: String(totals.subtotal),
        shipping: String(totals.shipping),
        tax: String(totals.tax),
        total: String(totals.total),
        currency,
        paymentMethod,
        paymentProvider,
        idempotencyKey: idempotencyKey ?? null,
        shipName: shipping.name,
        shipEmail: shipping.email,
        shipAddress: shipping.address,
      })
      .returning();

    /* edition_number reste NULL au stade "pending" : le numéro d'édition est
     * attribué à la FINALISATION (stock post-décrément, sous verrou de
     * ligne), jamais réservé en avance — c'est ce qui supprime la course. */
    for (const line of lines) {
      await txn.insert(orderItems).values({
        orderId: created.id,
        photoId: line.photoId,
        printConfigId: line.printConfigId,
        mountId: line.mountId,
        quantity: 1,
        unitPrice: String(line.unitPrice),
        lineTotal: String(line.unitPrice),
      });
    }

    return [created];
  });

  return { order, totals };
}

export class OrderError extends Error {
  status: number;
  /** Optional refund reason code: when a CONFIRMED payment cannot be
   *  fulfilled (stock exhausted, edition collision…) this code drives the
   *  `orders.refund_reason` recorded when the order moves to
   *  `refund_pending` (I6 amendments 1/2/7). */
  code?: RefundReason;
  constructor(message: string, status = 400, code?: RefundReason) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Finalizes an order once payment has been genuinely confirmed:
 *  - marks the order "paid"
 *  - decrements edition stock
 *  - issues a numbered Certificate of Authenticity per line item
 *  - credits each photographer's available balance with their share
 *    (80% of the line total, Aperio retains a 20% platform commission)
 * Idempotent: calling this twice on an already-paid order is a no-op.
 */
export async function finalizeOrder(orderNumber: string, paymentRef?: string) {
  return withRetry(() => db.transaction(async (txn) => finalizeOrderTx(txn, orderNumber, paymentRef)));
}

/** Nombre maximal de tentatives d'une transaction (1 essai initial + 2 relances). */
const RETRY_MAX_ATTEMPTS = 3;

/** Délai aléatoire court entre deux essais : évite que les transactions en
 *  conflit repartent exactement en phase (thundering herd). */
function retryDelayMs(): number {
  return 25 + Math.floor(Math.random() * 75);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Relance la closure jusqu'à 3 tentatives au total si Postgres signale un
 *  interblocage (40P01) ou un échec de sérialisation (40001) ; sinon propage
 *  immédiatement. La transaction annulée est jetée — on ne rejoue jamais
 *  d'état partiel. Exporté pour les tests unitaires. */
export async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt < RETRY_MAX_ATTEMPTS && isRetryablePgError(err)) {
        await sleep(retryDelayMs());
        continue;
      }
      throw err;
    }
  }
}

/**
 * Verrouille, en UNE requête et dans un ordre global déterministe, toutes les
 * lignes `users` concernées par une commande : l'acheteur, plus les
 * photographes de ses lignes. C'est ce qui empêche deux transactions
 * concurrentes de s'interbloquer quand elles débitent/créditent les mêmes
 * comptes dans un ordre opposé (le tri par `photo_id` ne couvrait que les
 * photos, pas les soldes). Les lignes déjà verrouillées par la transaction
 * courante sont simplement re-verrouillées (no-op).
 */
async function lockOrderUsers(txn: OrderTx, orderNumber: string, extraUserIds: number[] = []): Promise<void> {
  const [order] = await txn
    .select({ id: orders.id, userId: orders.userId })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  const ids = new Set<number>(extraUserIds);
  if (order) {
    ids.add(order.userId);
    const items = await txn
      .select({ photoId: orderItems.photoId })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const photoIds = [...new Set(items.map((i) => i.photoId))];
    if (photoIds.length > 0) {
      const rows = await txn
        .select({ photographerId: photos.photographerId })
        .from(photos)
        .where(inArray(photos.id, photoIds));
      for (const r of rows) ids.add(r.photographerId);
    }
  }

  const sorted = [...ids].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  if (sorted.length === 0) return;
  await txn
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, sorted))
    .orderBy(asc(users.id))
    .for("update");
}

/**
 * Transaction-aware implementation of finalizeOrder. Public signature stays
 * unchanged; the wallet checkout reuses this inside its own transaction so the
 * balance debit and the finalization are atomic.
 */
export async function finalizeOrderTx(txn: OrderTx, orderNumber: string, paymentRef?: string) {
  /* Verrouillage global et trié des comptes AVANT toute écriture : deux
   * finalisations concurrentes qui se croisent (A crédite B et B crédite A)
   * acquièrent les verrous dans le même ordre et ne peuvent plus s'interbloquer. */
  await lockOrderUsers(txn, orderNumber);

  /* Idempotence: the very first operation is a guarded status flip. If no row
   * comes back the order is not "pending" anymore, so it has already been
   * processed by a previous call (webhook replay / admin double-confirm):
   * we return "already finalized" WITHOUT replaying anything (no stock
   * decrement, no credit, no duplicate certificate). */
  const [order] = await txn
    .update(orders)
    .set(paymentRef ? { status: "paid", paymentRef } : { status: "paid" })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending")))
    .returning();

  if (!order) {
    const [existing] = await txn
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!existing) throw new OrderError("Commande introuvable.", 404);
    return { order: existing, certificates: [] as Array<typeof certificates.$inferSelect>, alreadyFinalized: true };
  }

  /* Lignes triées par photo_id : les décréments de stock verrouillent les
   * photos dans un ordre global déterministe, ce qui élimine les
   * interblocages entre finalisations concurrentes qui partagent des tirages. */
  const items = await txn
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.photoId));
  const certs: Array<typeof certificates.$inferSelect> = [];

  for (const item of items) {
    const [photo] = await txn.select().from(photos).where(eq(photos.id, item.photoId)).limit(1);
    if (!photo) continue;

    let editionNumber: number | null = item.editionNumber;

    // Atomic stock decrement with an explicit guard: never goes below zero.
    // Le numéro d'édition est dérivé du stock POST-décrément (verrou de
    // ligne) : deux finalisations concurrentes ne peuvent pas lire le même
    // stock, et l'index unique partiel (photo_id, edition_number) — migration
    // 0009 — garantit qu'un même numéro n'est jamais attribué deux fois.
    if (photo.availableStock !== null) {
      const updated = await txn
        .update(photos)
        .set({ availableStock: sql`${photos.availableStock} - 1` })
        .where(and(eq(photos.id, photo.id), gt(photos.availableStock, 0)))
        .returning({ id: photos.id, totalEditions: photos.totalEditions, availableStock: photos.availableStock });
      if (updated.length === 0) {
        throw new OrderError(`Plus assez d'exemplaires disponibles pour « ${photo.title} ».`, 409, "stock_exhausted");
      }
      const { totalEditions, availableStock } = updated[0];
      if (totalEditions === null || availableStock === null) {
        throw new OrderError(
          `Impossible de calculer le numéro d'édition pour « ${photo.title} » (compteur d'éditions non configuré).`,
          409,
          "edition_counter_invalid",
        );
      }
      const nextEdition = Number(totalEditions) - Number(availableStock);
      if (!Number.isInteger(nextEdition) || nextEdition < 1) {
        throw new OrderError(
          `Numéro d'édition invalide pour « ${photo.title} » : incohérence dans la comptabilité des éditions. La commande est annulée.`,
          409,
          "edition_counter_invalid",
        );
      }
      editionNumber = nextEdition;
      try {
        await txn.update(orderItems).set({ editionNumber }).where(eq(orderItems.id, item.id));
      } catch (err) {
        /* 23505 sur l'index unique (photo_id, edition_number) : le numéro a
         * déjà été attribué (corruption / rejeu anormal). Erreur explicite,
         * rollback intégral — jamais un 500 opaque. */
        if (isUniqueViolation(err)) {
          throw new OrderError(
            `Conflit sur le numéro d'édition de « ${photo.title} » : déjà attribué. La commande est annulée et aucun reçu n'a été émis.`,
            409,
            "edition_collision",
          );
        }
        throw err;
      }
    }

    // Credit the photographer's balance (80% of the line total).
    const lineTotal = parseFloat(item.lineTotal);
    const share = Math.round(lineTotal * (1 - PLATFORM_COMMISSION_RATE) * 100) / 100;
    await creditBalance(txn, photo.photographerId, share);
    await txn.update(orderItems).set({ photographerShare: String(share) }).where(eq(orderItems.id, item.id));

    // Issue the certificate of authenticity. The unique constraint on
    // order_item_id (migration 0007) makes a duplicate a no-op.
    const serialNumber = `APR-${new Date().getFullYear()}-${String(editionNumber ?? 0).padStart(3, "0")}-${randomInt(1000, 9999)}`;
    const watermarkHash = randomBytes(16).toString("hex").toUpperCase();
    const [cert] = await txn
      .insert(certificates)
      .values({ orderItemId: item.id, photoId: item.photoId, serialNumber, watermarkHash })
      .onConflictDoNothing({ target: certificates.orderItemId })
      .returning();
    if (cert) certs.push(cert);
  }

  /* Record the purchase in the buyer's wallet ledger (history only — the
   * order was paid directly via the payment provider, not from balance).
   * Inside the same transaction as the finalization. */
  await txn.insert(walletTransactions).values({
    userId: order.userId,
    reference: `PRC-${order.orderNumber}`,
    amount: String(Math.round(parseFloat(order.total) * 100) / 100),
    type: "purchase",
    status: "completed",
    paymentMethod: normalizeWalletPaymentMethod(order.paymentProvider ?? "stripe"),
    transactionReference: paymentRef ?? null,
  });

  return { order, certificates: certs, alreadyFinalized: false };
}

/* ------------------------------------------------------------------ */
/*  Paiement wallet (checkout)                                         */
/* ------------------------------------------------------------------ */

/** Sentinelle interne : un ordre déjà finalisé par une requête concurrente
 *  pendant la transaction signale son cas en throwing — le `db.transaction`
 *  de la lib roule alors l'intégralité de la transaction (débit compris). */
const PAY_ORDER_ALREADY_FINALIZED = Symbol("payOrderWithWallet.alreadyFinalized");

export interface PayOrderWithWalletResult {
  /** true quand l'ordre a été payé par une requête concurrente pendant la
   *  transaction : le débit de CET appel a été annulé (rollback). */
  alreadyFinalized: boolean;
}

/**
 * Wallet checkout : débit du solde + finalisation dans UNE SEULE transaction.
 *
 * Utilisée par POST /api/checkout/wallet ET par les scripts de test — les
 * tests exercent donc exactement le code de production, pas un miroir.
 *
 * Atomicité :
 *  - le débit est un UPDATE gardé (jamais en dessous de zéro, même sous
 *    requêtes concurrentes) ;
 *  - si `finalizeOrderTx` renvoie `alreadyFinalized: true` (ordre déjà payé
 *    par une requête concurrente pendant notre transaction), la transaction
 *    entière est ANNULÉE : le débit de cet appel est annulé, jamais un débit
 *    double pour une seule vente ;
 *  - si la finalisation échoue pour toute autre raison, le rollback annule
 *    aussi le débit (l'ordre reste "pending").
 */
export async function payOrderWithWallet(
  order: { orderNumber: string; total: string },
  userId: number,
): Promise<PayOrderWithWalletResult> {
  try {
    await withRetry(() =>
      db.transaction(async (txn) => {
        const total = parseFloat(order.total);

      /* Verrouillage global et trié des comptes (acheteur + photographes)
       * AVANT le débit : évite tout interblocage entre deux paiements croisés. */
      await lockOrderUsers(txn, order.orderNumber, [userId]);

      // Débit atomique du solde (UPDATE gardé : aucun dépassement possible).
      const [updated] = await txn
        .update(users)
        .set({ availableBalance: sql`(available_balance - ${total.toFixed(2)}::numeric)` })
        .where(and(eq(users.id, userId), gte(sql`available_balance::numeric`, total)))
        .returning({ id: users.id });
      if (!updated) {
        /* Le débit a été refusé. Deux causes possibles :
         *  1. solde réellement insuffisant → 402 (l'ordre reste "pending" et
         *     la retry avec la même clé reprendra ce paiement) ;
         *  2. un paiement CONCURRENT vient de vider le solde en finalisant CET
         *     ordre pendant notre transaction → pas une erreur utilisateur :
         *     cet appel est le "perdant" de la course, on doit renvoyer
         *     alreadyFinalized et non un faux 402. */
        const [cur] = await txn
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.orderNumber, order.orderNumber))
          .limit(1);
        if (cur && cur.status !== "pending") throw PAY_ORDER_ALREADY_FINALIZED;
        throw new OrderError(
          "Solde insuffisant. Rechargez votre portefeuille avant de valider la commande.",
          402,
        );
      }

      const res = await finalizeOrderTx(txn, order.orderNumber, order.orderNumber);

      /* L'ordre n'est plus "pending" : une requête concurrente l'a déjà payé.
       * On ne doit ni re-finaliser (déjà fait) ni committer notre débit. Le
       * throw déclenche le rollback complet de la transaction. */
      if (res.alreadyFinalized) {
        throw PAY_ORDER_ALREADY_FINALIZED;
      }
      }),
    );
    return { alreadyFinalized: false };
  } catch (err) {
    if (err === PAY_ORDER_ALREADY_FINALIZED) return { alreadyFinalized: true };
    throw err;
  }
}

/**
 * Crédite le solde disponible de manière atomique (UPDATE SQL incrémental,
 * exécuté via le client transactionnel passé en paramètre pour rester dans
 * la même transaction que la finalisation).
 */
async function creditBalance(txn: Pick<OrderTx, "execute">, userId: number, amount: number) {
  const normalized = Math.round(amount * 100) / 100;
  if (normalized <= 0) return;
  await txn.execute(sql`
    UPDATE users
    SET available_balance = (available_balance::numeric + ${normalized}::numeric)
    WHERE id = ${userId}
  `);
}

export async function getOrderWithCertificates(orderNumber: string) {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const itemIds = items.map((i) => i.id);
  const certs = itemIds.length
    ? await db.select().from(certificates).where(inArray(certificates.orderItemId, itemIds))
    : [];
  return { order, items, certificates: certs };
}

/* ------------------------------------------------------------------ */
/*  Digital HD license orders                                          */
/* ------------------------------------------------------------------ */

export type DigitalLicenseType = "commercial" | "personal";

export interface DigitalOrderResult {
  order: typeof orders.$inferSelect;
  item: typeof orderItems.$inferSelect;
  amount: number;
}

/**
 * Creates a PENDING digital HD license order for a single photo. Unlike the
 * print flow there is no shipping, no edition reservation and no certificate:
 * the buyer pays once and gains a permanent download entitlement. The price
 * charged is the photo's base price; it is re-read from the database here so
 * the client can never set its own amount. The order is only marked
 * "completed" by a verified payment confirmation (Stripe webhook / admin
 * reconciliation), never directly by the client.
 */
export async function createDigitalOrder(opts: {
  userId: number;
  photoId: number;
  licenseType: DigitalLicenseType;
  paymentProvider: string;
  /** Display/payment currency selected by the buyer. */
  currency?: string;
}): Promise<DigitalOrderResult> {
  const { userId, photoId, licenseType, paymentProvider, currency = "EUR" } = opts;

  const [photo] = await db
    .select({
      id: photos.id,
      title: photos.title,
      slug: photos.slug,
      basePrice: photos.basePrice,
      hdPath: photos.hdPath,
      isPublished: photos.isPublished,
    })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo || !photo.isPublished) throw new OrderError("Cette photo n'est plus disponible.", 404);
  if (!photo.hdPath) throw new OrderError("Le fichier haute définition de cette photo n'est pas disponible à la vente.", 409);

  const amount = Math.round(parseFloat(photo.basePrice) * 100) / 100;
  if (amount <= 0) throw new OrderError("Cette photo n'est pas configurée pour la vente.", 409);

  const orderNumber = `APR-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      userId,
      kind: "digital",
      status: "pending",
      subtotal: String(amount),
      shipping: "0",
      tax: "0",
      total: String(amount),
      currency,
      paymentMethod: "card",
      paymentProvider,
    })
    .returning();

  const [item] = await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      photoId,
      quantity: 1,
      unitPrice: String(amount),
      lineTotal: String(amount),
      licenseType,
    })
    .returning();

  return { order, item, amount };
}

/**
 * Finalizes a digital HD license order once payment has been genuinely
 * confirmed:
 *  - marks the order "completed"
 *  - records the download entitlement (buyer → photo)
 *  - bumps the photo download counter
 *  - credits the photographer's available balance with their share
 *    (80% of the total, Aperio retains a 20% platform commission)
 * Idempotent: calling this twice on an already-completed order is a no-op.
 */
export async function completeDigitalOrder(orderNumber: string, paymentRef?: string) {
  return db.transaction(async (txn) => completeDigitalOrderTx(txn, orderNumber, paymentRef));
}

/**
 * Transaction-aware implementation of completeDigitalOrder. The public
 * signature stays unchanged; everything runs inside a single transaction.
 */
export async function completeDigitalOrderTx(txn: OrderTx, orderNumber: string, paymentRef?: string) {
  /* Verrouillage global et trié des comptes avant toute écriture (mêmes
   * garanties anti-interblocage que finalizeOrderTx). */
  await lockOrderUsers(txn, orderNumber);

  /* Idempotence: the very first write is a guarded status flip to
   * "completed". If no row comes back, the order has already been processed
   * (webhook replay) and nothing is replayed. */
  const [order] = await txn
    .update(orders)
    .set(paymentRef ? { status: "completed", paymentRef } : { status: "completed" })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending"), eq(orders.kind, "digital")))
    .returning();

  if (!order) {
    const [existing] = await txn
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!existing) throw new OrderError("Commande introuvable.", 404);
    if (existing.kind !== "digital") {
      throw new OrderError("Cette commande n'est pas un achat numérique.", 400);
    }
    return { order: existing, alreadyFinalized: true, entitlementsCreated: 0 };
  }

  const items = await txn.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  let entitlementsCreated = 0;

  for (const item of items) {
    const [photo] = await txn
      .select({ id: photos.id, photographerId: photos.photographerId })
      .from(photos)
      .where(eq(photos.id, item.photoId))
      .limit(1);
    if (!photo) continue;

    // One entitlement per (buyer, photo) — the unique index
    // (entitlements_user_photo_idx) makes a duplicate a no-op.
    const inserted = await txn
      .insert(entitlements)
      .values({
        userId: order.userId,
        photoId: item.photoId,
        orderId: order.id,
        licenseType: item.licenseType ?? "personal",
      })
      .onConflictDoNothing({ target: [entitlements.userId, entitlements.photoId] })
      .returning({ id: entitlements.id });
    if (inserted.length > 0) entitlementsCreated++;

    // Download counter — atomic increment.
    await txn
      .update(photos)
      .set({ downloads: sql`${photos.downloads} + 1` })
      .where(eq(photos.id, photo.id));

    // Credit the photographer's balance (80% of the line total).
    const lineTotal = parseFloat(item.lineTotal);
    const share = Math.round(lineTotal * (1 - PLATFORM_COMMISSION_RATE) * 100) / 100;
    await creditBalance(txn, photo.photographerId, share);
    await txn.update(orderItems).set({ photographerShare: String(share) }).where(eq(orderItems.id, item.id));
  }

  /* Record the purchase in the buyer's wallet ledger (history only), inside
   * the same transaction as the finalization. */
  await txn.insert(walletTransactions).values({
    userId: order.userId,
    reference: `PRC-${order.orderNumber}`,
    amount: String(Math.round(parseFloat(order.total) * 100) / 100),
    type: "purchase",
    status: "completed",
    paymentMethod: normalizeWalletPaymentMethod(order.paymentProvider ?? "stripe"),
    transactionReference: paymentRef ?? null,
  });

  return { order, alreadyFinalized: false, entitlementsCreated };
}

/* ------------------------------------------------------------------ */
/*  Refund lifecycle (I6 — amendments 1, 2, 7)                         */
/* ------------------------------------------------------------------ */
/*
 * When a REAL payment is confirmed but the order cannot be fulfilled (stock
 * exhausted, edition collision, amount mismatch…), the buyer must be
 * reimbursed. The sequence is:
 *
 *   1. `markOrderRefundPending`  — NEW short transaction (always after the
 *      finalization rollback): guarded flip pending → `refund_pending` and
 *      records `refund_reason` + the provider's `paymentRef`. The guard
 *      `WHERE status='pending'` makes it naturally race-safe.
 *   2. `refundStripeCharge`      — REAL Stripe API call, OUTSIDE any DB
 *      transaction, idempotent via the `refund-<orderNumber>` key.
 *   3. `refundOrderToRefunded`   — guarded flip `refund_pending` → `refunded`
 *      together with `refund_id` / `refunded_at`. Only AFTER the refund call
 *      succeeded ("processed" is only reached once the money is back).
 *
 * An errored refund call keeps the order `refund_pending` and lets the
 * webhook answer 5xx: the event stays `received` and a replay retries the
 * refund with the SAME idempotency key — never a double reimbursement.
 */

/** Maps an order refund reason to the Stripe refund `reason` (API enum). */
function refundReasonForStripe(
  reason: RefundReason | string | null | undefined,
): "requested_by_customer" | "fraudulent" | "duplicate" | undefined {
  if (reason === "amount_mismatch" || reason === "currency_mismatch") return "fraudulent";
  if (reason === "edition_collision" || reason === "finalization_failed") return "duplicate";
  return "requested_by_customer";
}

/**
 * Moves a still-"pending" order to `refund_pending` and records why.
 * Runs in its OWN transaction — it is ALWAYS called after a finalization
 * attempt already rolled back, never inside the finalization transaction.
 * Returns the freshly-flipped order, or null when the order is no longer
 * "pending" (already refunded by a concurrent webhook).
 */
export async function markOrderRefundPending(
  orderNumber: string,
  reason: RefundReason,
  paymentRef?: string,
): Promise<typeof orders.$inferSelect | null> {
  const [order] = await db
    .update(orders)
    .set({
      status: "refund_pending",
      refundReason: reason,
      paymentRef: sql`coalesce(${paymentRef ?? null}, payment_ref)`,
    })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending")))
    .returning();
  return order ?? null;
}

/**
 * Flips a CANCELLED order to `refund_pending` when a payment confirmation
 * arrives AFTER the order was cancelled (late success, I6 étape 3): the
 * customer's money actually landed on an order the platform already
 * cancelled — the operator must refund it manually. Guarded so only a
 * "cancelled" row can move, and nothing is ever re-credited (finalization
 * is impossible on a non-pending order).
 */
export async function markOrderRefundPendingAfterCancellation(
  orderNumber: string,
  reason: RefundReason,
  paymentRef?: string,
): Promise<typeof orders.$inferSelect | null> {
  const [order] = await db
    .update(orders)
    .set({
      status: "refund_pending",
      refundReason: reason,
      paymentRef: sql`coalesce(${paymentRef ?? null}, payment_ref)`,
    })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "cancelled")))
    .returning();
  return order ?? null;
}

export interface RefundOrderResult {
  status:
    | "refunded"
    | "refund-pending"
    | "not-refund-pending"
    | "unmatched"
    | "already-refunded";
  reason?: string;
  refundId?: string | null;
  order?: typeof orders.$inferSelect;
}

/**
 * Drives the refund of a `refund_pending` order to its terminal `refunded`
 * state. Idempotent and race-safe:
 *  - already `refunded`   → "already-refunded" (no second refund);
 *  - no paymentRef        → stays "refund-pending" (human must act);
 *  - refund already done  → just flips the DB status (refund_id present);
 *  - otherwise            → real Stripe refund, then the guarded status flip.
 * Throws on Stripe API failure so the webhook can answer 5xx and retry.
 */
export async function refundOrderToRefunded(orderNumber: string): Promise<RefundOrderResult> {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return { status: "unmatched" };

  if (order.status !== "refund_pending") {
    if (order.status === "refunded") return { status: "already-refunded", order };
    return { status: "not-refund-pending", order };
  }
  if (!order.paymentRef) {
    return { status: "refund-pending", reason: "missing-payment-ref", order };
  }
  if (order.refundId) {
    /* A concurrent replier already disbursed the money: just finalize the
     * status (guarded — only a "refund_pending" row can flip). */
    const [flipped] = await db
      .update(orders)
      .set({ status: "refunded", refundedAt: new Date() })
      .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "refund_pending")))
      .returning();
    return {
      status: "already-refunded",
      refundId: order.refundId,
      order: flipped ?? order,
    };
  }

  const { refundId } = await refundStripeCharge({
    orderNumber,
    paymentRef: order.paymentRef,
    idempotencyKey: `refund-${orderNumber}`,
    reason: refundReasonForStripe(order.refundReason),
  });

  const [done] = await db
    .update(orders)
    .set({ status: "refunded", refundId, refundedAt: new Date() })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "refund_pending")))
    .returning();
  return { status: "refunded", refundId, order: done ?? undefined };
}

/* ------------------------------------------------------------------ */
/*  Manual Mobile Money refund (I6 clôture — tâche 1)                  */
/* ------------------------------------------------------------------ */
/*  A `refund_pending` order paid via Orange/MVola/Airtel can NEVER be
 *  reimbursed through `refundStripeCharge` — the operator restitution is a
 *  MANUAL human act (no card-refund API wired). Once the admin confirms the
 *  restitution, this terminal transition is driven here. NO clawback: a
 *  `refund_pending` order was by construction never credited — the
 *  photographer's credit only exists AFTER the guarded pending→paid flip of
 *  `finalizeOrderTx`, and an order in `refund_pending` either rolled back
 *  before that flip or arrived there from `cancelled` (late success);
 *  `clawbackOrderCredits` itself treats a `refund_pending` order as
 *  not-credited. Idempotent and race-safe: the write is a GUARDED flip
 *  (`WHERE status = 'refund_pending'`) executed inside one transaction holding
 *  the shared ordered account locks, exactly like every money transition here.
 */
export interface ManualOrderRefundResult {
  status: "refunded" | "already-refunded" | "not-refund-pending" | "stripe-payment" | "unmatched";
  refundId?: string | null;
  order?: typeof orders.$inferSelect;
}

export async function markOrderRefundedManual(
  orderNumber: string,
  operatorReference: string,
): Promise<ManualOrderRefundResult> {
  return withRetry(() =>
    db.transaction(async (txn) => {
      const [order] = await txn.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
      if (!order) return { status: "unmatched" };
      if (order.status === "refunded") return { status: "already-refunded", refundId: order.refundId, order };
      if (order.status !== "refund_pending") return { status: "not-refund-pending", order };

      /* Stripe payments must go through retry-refund (REAL Stripe refund) —
       * never accept a "manual restitution" that would silently skip it. */
      if (order.paymentProvider === "stripe") return { status: "stripe-payment", order };

      await lockOrderUsers(txn, orderNumber);

      const refundId = `manual:${operatorReference}`;
      const [flipped] = await txn
        .update(orders)
        .set({ status: "refunded", refundId, refundedAt: new Date() })
        .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "refund_pending")))
        .returning();

      if (!flipped) {
        const [cur] = await txn.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
        if (cur?.status === "refunded") return { status: "already-refunded", refundId: cur.refundId, order: cur };
        return { status: "not-refund-pending", order: cur ?? undefined };
      }

      return { status: "refunded", refundId, order: flipped };
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Clawback & dispute refunds (I6 — amendments 3, 6, 11)             */
/* ------------------------------------------------------------------ */
/*  When a FINALIZED order is later refunded (Stripe `charge.refunded` on a
 *  fulfilled order, or a lost dispute), the photographer's credit must be
 *  clawed back — the money returns to the buyer's card, it no longer belongs
 *  to the seller. Sequence:
 *
 *   1. GUARDED status flip paid|shipped|delivered|completed → `refunded`
 *      inside ONE transaction, AFTER the shared account row locks (same
 *      deterministic order as the finalization, so no deadlock).
 *   2. Debit EACH photographer's available balance by their recorded share.
 *      No lower bound: a photographer whose balance was already withdrawn can
 *      legitimately go NEGATIVE (the platform owns the debt, I6).
 *   3. One wallet ledger line `RFD-<orderNumber>` per photographer (suffix
 *      only when a single order credits several photographers); the unique
 *      reference + the guarded flip make a replay claw back exactly once.
 *   4. Revoke the certificates (they must display "révoqué") and delete the
 *      digital download entitlements.
 *
 *  An order in `refund_pending` was NEVER credited (finalization rolled back
 *  before the credit) — there is nothing to claw back; the Stripe
 *  `charge.refunded` then simply finalizes it to `refunded` without any
 *  clawback (see `finalizeRefundPendingCharge`).
 */

export interface ClawbackResult {
  status:
    | "clawed"
    | "already-refunded"
    | "not-finalized"
    | "not-credited"
    | "unmatched";
  order?: typeof orders.$inferSelect;
  clawbackAmount?: number;
  revokedCertificates?: number;
  entitlementsDeleted?: number;
}

/** Reverses the photographer-side credit of a finalized order. Safe to call
 *  on every `charge.refunded`/lost-dispute event: replay idempotence is the
 *  guarded status flip (only paid/shipped/delivered/completed can flip), the
 *  RFD ledger reference is UNIQUE, and certificates are only revoked once. */
export async function clawbackOrderCredits(orderNumber: string): Promise<ClawbackResult> {
  return withRetry(() =>
    db.transaction(async (txn) => {
      const [order] = await txn.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
      if (!order) return { status: "unmatched" };

      if (!isSaleStatus(order.status)) {
        if (order.status === "refunded") return { status: "already-refunded", order };
        if (order.status === "refund_pending") {
          /* Refund already promised for a payment that NEVER credited the
           * photographer (finalization rolled back): no clawback to do. */
          return { status: "not-credited", order };
        }
        return { status: "not-finalized", order };
      }

      /* Shared, deterministically-sorted account locks BEFORE any write —
       * same guarantee as finalizeOrderTx (never deadlock with a concurrent
       * finalization or wallet payment). */
      await lockOrderUsers(txn, orderNumber);

      const [flipped] = await txn
        .update(orders)
        .set({
          status: "refunded",
          refundedAt: new Date(),
          refundReason: sql`coalesce(refund_reason, 'order_refunded')`,
        })
        .where(and(eq(orders.orderNumber, orderNumber), inArray(orders.status, [...SALE_STATUSES])))
        .returning();
      if (!flipped) {
        /* A concurrent replier already moved it: only `refunded` is terminal
         * here — anything else means our earlier read is stale (unmatched). */
        const [cur] = await txn
          .select()
          .from(orders)
          .where(eq(orders.orderNumber, orderNumber))
          .limit(1);
        if (cur && cur.status === "refunded") return { status: "already-refunded", order: cur };
        return { status: "not-finalized", order: cur ?? undefined };
      }

      const itemRows = await txn.select().from(orderItems).where(eq(orderItems.orderId, flipped.id));
      const photoIds = [...new Set(itemRows.map((i) => i.photoId))];
      const photoRows = photoIds.length
        ? await txn
            .select({ id: photos.id, photographerId: photos.photographerId })
            .from(photos)
            .where(inArray(photos.id, photoIds))
        : [];
      const photogByPhoto = new Map(photoRows.map((p) => [p.id, p.photographerId]));

      /* Revoke this order's certificates (idempotent: revoked_at only set when
       * currently NULL). */
      let revokedCertificates = 0;
      if (itemRows.length > 0) {
        const certRows = await txn
          .select({ id: certificates.id })
          .from(certificates)
          .where(inArray(certificates.orderItemId, itemRows.map((i) => i.id)));
        if (certRows.length > 0) {
          const res = await txn
            .update(certificates)
            .set({ revokedAt: new Date() })
            .where(
              and(
                inArray(certificates.orderItemId, itemRows.map((i) => i.id)),
                isNull(certificates.revokedAt),
              ),
            );
          revokedCertificates = res.rowCount ?? 0;
        }
      }

      /* Digital orders: the download entitlements die with the refund. */
      const entRes = await txn.delete(entitlements).where(eq(entitlements.orderId, flipped.id));
      const entitlementsDeleted = entRes.rowCount ?? 0;

      /* Per-photographer owed amount = recorded share (fallback: 80% of line,
       * matches the finalization credit). */
      const owed = new Map<number, number>();
      for (const item of itemRows) {
        const pid = photogByPhoto.get(item.photoId);
        if (!pid) continue;
        const share =
          (item.photographerShare !== null && parseFloat(item.photographerShare)) ||
          Math.round(parseFloat(item.lineTotal) * (1 - PLATFORM_COMMISSION_RATE) * 100) / 100;
        if (!(share > 0)) continue;
        owed.set(pid, Math.round(((owed.get(pid) ?? 0) + share) * 100) / 100);
      }

      let clawbackAmount = 0;
      const photographers = [...owed.entries()].sort((a, b) => a[0] - b[0]);
      for (const [pid, amount] of photographers) {
        await debitBalance(txn, pid, amount);
        await txn.insert(walletTransactions).values({
          userId: pid,
          /* UNIQUE ledger reference: a single-photographer order gets exactly
           * `RFD-<orderNumber>`; multi-photographer orders get a stable
           * suffix so the global uniqueness holds. */
          reference: photographers.length === 1 ? `RFD-${orderNumber}` : `RFD-${orderNumber}-${pid}`,
          amount: String(amount),
          type: "clawback",
          status: "completed",
          paymentMethod: normalizeWalletPaymentMethod(flipped.paymentProvider ?? "stripe"),
          transactionReference: flipped.paymentRef ?? null,
        });
        clawbackAmount = Math.round((clawbackAmount + amount) * 100) / 100;
      }

      return {
        status: "clawed",
        order: flipped,
        clawbackAmount,
        revokedCertificates,
        entitlementsDeleted,
      };
    }),
  );
}

/** Finalizes a `refund_pending` order to `refunded` when Stripe confirms the
 *  charge was refunded (`charge.refunded`). Such an order was NEVER credited
 *  to the photographer — no clawback, no certificate revocation (none were
 *  issued), the refund already happened on Stripe's side. Guarded + idempotent. */
export async function finalizeRefundPendingCharge(orderNumber: string): Promise<boolean> {
  const [done] = await db
    .update(orders)
    .set({ status: "refunded", refundedAt: new Date() })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "refund_pending")))
    .returning();
  return Boolean(done);
}

/** Débit non gardé du solde disponible (pas de borne inférieure : le solde
 *  peut devenir négatif — dette du vendeur envers la plateforme). */
async function debitBalance(txn: Pick<OrderTx, "execute">, userId: number, amount: number) {
  const normalized = Math.round(amount * 100) / 100;
  if (normalized <= 0) return;
  await txn.execute(sql`
    UPDATE users
    SET available_balance = (available_balance::numeric - ${normalized}::numeric)
    WHERE id = ${userId}
  `);
}

export interface ConfirmPaymentOutcome {
  status:
    | "finalized"
    | "already-finalized"
    | "refunded"
    | "refund-pending"
    | "unmatched"
    | "not-refund-pending";
  reason?: RefundReason | string;
  refundId?: string | null;
  order?: typeof orders.$inferSelect;
  /** Finalizer details, when applicable (digital: entitlements count…). */
  details?: Record<string, unknown>;
}

/**
 * Resolves ONE confirmed payment against an order, no matter the origin
 * (Stripe webhook, Mobile Money callback, admin reconciliation):
 *
 *  - not found             → `unmatched`
 *  - finalization succeeds → `finalized`
 *  - already processed     → `already-finalized`
 *  - definitive failure    → mark `refund_pending` (+reason) then refund →
 *                           `refunded` or `refund-pending`
 *                           (with `skipRefund`, stop at `refund-pending` —
 *                           Mobile Money operator refunds are manual)
 *
 * This is the SINGLE shared code path for every confirmation source, so the
 * admin `/confirm` route reaches exactly the same stock/collision/refund
 * behaviour as the webhooks (amendment 1/2/7 + admin requirement).
 * Transient (non-OrderError) failures are re-thrown → caller returns 5xx.
 */
export async function handleConfirmedPayment(
  orderNumber: string,
  paymentRef?: string,
  opts?: { skipRefund?: boolean },
): Promise<ConfirmPaymentOutcome> {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return { status: "unmatched" };

  const finalizer = order.kind === "digital" ? completeDigitalOrder : finalizeOrder;
  try {
    const res = await finalizer(orderNumber, paymentRef);
    if (res.alreadyFinalized) {
      /* Re-read: a concurrent webhook may have moved it to refund_pending in
       * the meantime — then we must complete the refund, not pretend the
       * fulfilment succeeded. */
      const [cur] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);
      if (cur && cur.status === "refund_pending") {
        if (opts?.skipRefund) {
          /* Mobile Money: the operator refund is manual — stop at the
           * refund_pending marker + alert, never a Stripe refund call. */
          return { status: "refund-pending", reason: cur.refundReason ?? undefined, order: cur };
        }
        const refund = await refundOrderToRefunded(orderNumber);
        return {
          status: refund.status === "refunded" || refund.status === "already-refunded" ? "refunded" : "refund-pending",
          reason: cur.refundReason ?? undefined,
          refundId: refund.refundId,
          order: refund.order ?? cur,
        };
      }
      return { status: "already-finalized", order: res.order, details: { ...res } };
    }
    return { status: "finalized", order: res.order, details: { ...res } };
  } catch (err) {
    if (err instanceof OrderError) {
      if (err.status === 404) return { status: "unmatched" };
      /* Definitive fulfilment failure (stock exhausted / collision /
       * counter invalid / photo unavailable): refund the buyer. */
      const reason: RefundReason = err.code ?? "finalization_failed";
      await markOrderRefundPending(orderNumber, reason, paymentRef);
      if (opts?.skipRefund) {
        return { status: "refund-pending", reason, order };
      }
      const refund = await refundOrderToRefunded(orderNumber);
      return {
        status: refund.status === "refunded" || refund.status === "already-refunded" ? "refunded" : "refund-pending",
        reason,
        refundId: refund.refundId,
        order: refund.order,
      };
    }
    throw err;
  }
}
