import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "db";
import { orderItems, orders } from "db/schema";
import { getSessionUser } from "lib/auth";
import { createPendingOrder, OrderError, payOrderWithWallet } from "lib/orders";
import { isUniqueViolation } from "lib/pg-errors";
import { checkoutSchema } from "lib/validation";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CheckoutLine = { photoId: number; sizeId?: number | null; mountId?: number | null; qty: number };

/* ------------------------------------------------------------------ */
/*  Signature du contenu (pour détecter une clé réutilisée avec un      */
/*  corps différent : 422).                                            */
/* ------------------------------------------------------------------ */

function lineSignature(lines: CheckoutLine[]): string {
  const norm = lines
    .map((l) => ({ p: l.photoId, s: l.sizeId ?? -1, m: l.mountId ?? -1, q: l.qty }))
    .sort((a, b) => a.p - b.p || a.s - b.s || a.m - b.m || a.q - b.q);
  return norm.map((x) => `${x.p}:${x.s}:${x.m}:${x.q}`).join(";");
}

function bodySignature(body: { items: CheckoutLine[]; currency?: string }): string {
  return `${lineSignature(body.items)}|${body.currency ?? "EUR"}`;
}

/** Reconstitue la signature depuis les lignes d'un ordre existant (les qty
 *  sont regroupées : createPendingOrder les éclate en lignes quantity=1). */
async function storedSignature(orderId: number): Promise<string> {
  const [order] = await db.select({ currency: orders.currency }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const rows = await db
    .select({
      p: orderItems.photoId,
      s: orderItems.printConfigId,
      m: orderItems.mountId,
      q: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const agg = new Map<string, { p: number; s: number | null; m: number | null; q: number }>();
  for (const r of rows) {
    const k = `${r.p}:${r.s ?? -1}:${r.m ?? -1}`;
    const cur = agg.get(k);
    if (cur) cur.q += r.q;
    else agg.set(k, { p: r.p, s: r.s, m: r.m, q: r.q });
  }
  const norm = [...agg.values()]
    .map((x) => ({ p: x.p, s: x.s ?? -1, m: x.m ?? -1, q: x.q }))
    .sort((a, b) => a.p - b.p || a.s - b.s || a.m - b.m || a.q - b.q);
  return `${norm.map((x) => `${x.p}:${x.s}:${x.m}:${x.q}`).join(";")}|${order?.currency ?? "EUR"}`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function findOrderByKey(userId: number, key: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)))
    .limit(1);
  return row ?? null;
}

function mapError(err: unknown): NextResponse {
  if (err instanceof OrderError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[checkout/wallet]", err);
  return NextResponse.json(
    { error: "Le paiement par portefeuille a échoué. Aucune somme n'a été débitée de votre solde." },
    { status: 500 },
  );
}

/** Applique les règles « commande existante pour cette clé » :
 *   - contenu différent  → 422
 *   - déjà payée         → 200 { orderNumber, alreadyProcessed }
 *   - encore pending     → on tente le paiement (débit+finalisation
 *     transactionnelle) → 201, ou 200 alreadyProcessed si une requête
 *     concurrente a payé pendant notre transaction.
 *   - autre statut       → 409                                                    */
async function dispatchExisting(userId: number, order: typeof orders.$inferSelect, body: z.infer<typeof checkoutSchema>) {
  const sig = await storedSignature(order.id);
  if (sig !== bodySignature(body)) {
    return NextResponse.json(
      { error: "Cet en-tête Idempotency-Key a déjà été utilisé avec un contenu de panier différent." },
      { status: 422 },
    );
  }

  if (order.status === "paid") {
    return NextResponse.json({ orderNumber: order.orderNumber, alreadyProcessed: true }, { status: 200 });
  }

  if (order.status === "pending") {
    const paid = await payOrderWithWallet(order, userId);
    if (paid.alreadyFinalized) {
      return NextResponse.json({ orderNumber: order.orderNumber, alreadyProcessed: true }, { status: 200 });
    }
    return NextResponse.json({ orderNumber: order.orderNumber }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Cette commande ne peut pas être réglée par portefeuille dans son état actuel." },
    { status: 409 },
  );
}

/**
 * POST /api/checkout/wallet — pay for a print order with the buyer's wallet
 * (available balance).
 *
 * Body: checkoutSchema (same as /api/checkout/stripe).
 *
 *  - Requires a signed-in user AND an `Idempotency-Key` header containing a
 *    UUID (400 otherwise). The key guarantees a wallet checkout is played
 *    AT MOST once per (user, key) — replaying the same request never creates
 *    a second order nor a second debit.
 *  - Creates the PENDING order (re-validating the cart server-side), then in
 *    a SINGLE transaction (payOrderWithWallet): atomically deducts the exact
 *    order total from the user's `available_balance` (guarded UPDATE refusing
 *    the charge when the balance is insufficient) and finalizes the order.
 *    If the order turns out to be already finalized by a concurrent request,
 *    the whole transaction rolls back: no second debit.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "L'en-tête Idempotency-Key est obligatoire et doit être un UUID." },
      { status: 400 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    /* Clé déjà connue pour cet utilisateur : on rejoue sur l'ordre existant. */
    const existing = await findOrderByKey(user.id, idempotencyKey);
    if (existing) return await dispatchExisting(user.id, existing, body);

    /* Aucun ordre pour cette clé : on crée le PENDING ordre (avec la clé
     * d'idempotence) puis on paie dans une transaction unique. */
    const created = await createPendingOrder({
      userId: user.id,
      idempotencyKey,
      items: body.items.map((i) => ({
        photoId: i.photoId,
        sizeId: i.sizeId ?? null,
        mountId: i.mountId ?? null,
        qty: i.qty,
      })),
      shipping: { name: body.shipName, email: body.shipEmail, address: body.shipAddress ?? {} },
      paymentMethod: "wallet",
      paymentProvider: "wallet",
      currency: body.currency,
    });

    const paid = await payOrderWithWallet(created.order, user.id);
    if (paid.alreadyFinalized) {
      /* Une requête concurrente a finalisé ce même ordre pendant la course :
       * on recharge et on applique les règles « existant » (200). */
      const reload = await findOrderByKey(user.id, idempotencyKey);
      if (reload) return await dispatchExisting(user.id, reload, body);
    }
    return NextResponse.json({ orderNumber: created.order.orderNumber }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      /* Course concurrente : l'INSERT de l'ordre a échoué sur l'index unique
       * (user_id, idempotency_key) — un concurrent a gagné la création. On
       * recharge l'ordre existant et on applique les règles ci-dessus. */
      const reload = await findOrderByKey(user.id, idempotencyKey);
      if (reload) {
        try {
          return await dispatchExisting(user.id, reload, body);
        } catch (err2) {
          return mapError(err2);
        }
      }
    }
    return mapError(err);
  }
}