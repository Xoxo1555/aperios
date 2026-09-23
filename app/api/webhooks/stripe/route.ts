import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "db";
import { orders, walletTransactions } from "db/schema";
import { constructStripeEvent, isStripeConfigured } from "lib/payments/stripe";
import { clawbackOrderCredits, finalizeRefundPendingCharge, handleConfirmedPayment, isSaleStatus } from "lib/orders";
import { completeWalletDeposit, isWalletReference } from "lib/wallet";
import { convertFromEur, normalizeCurrency, toMinorUnits } from "lib/money";
import { sendAdminAlert } from "lib/admin-alert";
import {
  claimWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventUnmatched,
  noteWebhookEventError,
} from "lib/webhook-events";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

const PROVIDER = "stripe" as const;

/** Session currency codes come lowercase from Stripe ("eur"); ours are
 *  uppercase ISO codes. */
function sameCurrency(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toUpperCase() === b.toUpperCase();
}

/**
 * Real Stripe webhook receiver (I6 amendments 4/8/9).
 *
 * Every event is signature-verified FIRST, then INSERTED into webhook_events
 * BEFORE any side effect; the unique (provider, event_id) key makes a replay
 * a harmless 200 no-op. The order is only finalized once the amount actually
 * charged matches the amount we recorded at checkout creation
 * (expected_amount_minor / expected_currency) — a mismatch (or an explicit
 * non-"paid" status) is never trusted as a successful payment.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe non configuré." }, { status: 501 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (err) {
    console.error("[webhooks/stripe] signature invalide", err);
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  /* Deduplication gate: bailed out BEFORE any side effect. */
  const claim = await claimWebhookEvent(PROVIDER, event.id, event);
  if (claim.status === "already-processed") return NextResponse.json({ received: true });

  try {
    switch (String(event.type)) {
      case "checkout.session.completed":
        await handleSessionCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        return NextResponse.json({ received: true });
      case "async_payment_succeeded":
        await handleAsyncPaymentSucceeded(event.data.object as Stripe.PaymentIntent, event.id);
        return NextResponse.json({ received: true });
      case "async_payment_failed":
        await handleAsyncPaymentFailed(event.data.object as Stripe.PaymentIntent, event.id);
        return NextResponse.json({ received: true });
      case "checkout.session.expired":
        await handleSessionExpired(event.data.object as Stripe.Checkout.Session, event.id);
        return NextResponse.json({ received: true });
      /* Refunds & disputes (I6 amendments 3 / 6 / 11). */
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge, event.id);
        return NextResponse.json({ received: true });
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object as Stripe.Dispute, event.id);
        return NextResponse.json({ received: true });
      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object as Stripe.Dispute, event.id);
        return NextResponse.json({ received: true });
      default:
        await markWebhookEventProcessed(PROVIDER, event.id);
        return NextResponse.json({ received: true });
    }
  } catch (err) {
    /* Transient failure (DB lock, Stripe refund API down…): the event stays
     * "received" and the 5xx makes Stripe retry it — replay is safe. */
    const obj = event.data.object as unknown as Record<string, unknown> | undefined;
    const orderNumber = obj && typeof obj.client_reference_id === "string" ? obj.client_reference_id : undefined;
    await noteWebhookEventError(PROVIDER, event.id, err, orderNumber);
    console.error("[webhooks/stripe] échec de traitement", event.id, err);
    return NextResponse.json({ error: "Échec de traitement." }, { status: 500 });
  }
}

/** Resolves the order number behind a checkout session (client ref or
 *  metadata), and the payment record behind it (PaymentIntent or session id). */
function sessionRefs(session: Stripe.Checkout.Session): {
  orderNumber: string | null;
  paymentRef: string | null;
} {
  const orderNumber = session.client_reference_id ?? session.metadata?.orderNumber ?? null;
  const paymentRef = (session.payment_intent as string | undefined) ?? session.id ?? null;
  return { orderNumber, paymentRef };
}

/** Re-validates the charged amount against the value recorded at checkout
 *  creation. Returns `null` when nothing is known (legacy order) — the check
 *  is then skipped. */
async function sessionMatchesExpected(
  session: Stripe.Checkout.Session,
): Promise<{ ok: true } | { ok: false; reason: "amount_mismatch" | "currency_mismatch"; charged: string; expected: string }> {
  const { orderNumber } = sessionRefs(session);
  if (!orderNumber) return { ok: true };
  const [order] = await db
    .select({
      expectedAmountMinor: orders.expectedAmountMinor,
      expectedCurrency: orders.expectedCurrency,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order || order.expectedAmountMinor == null || !order.expectedCurrency) return { ok: true };

  if (!sameCurrency(session.currency, order.expectedCurrency)) {
    return {
      ok: false,
      reason: "currency_mismatch",
      charged: `${session.amount_total} ${session.currency}`,
      expected: `${order.expectedAmountMinor} ${order.expectedCurrency}`,
    };
  }
  if ((session.amount_total ?? -1) !== order.expectedAmountMinor) {
    return {
      ok: false,
      reason: "amount_mismatch",
      charged: `${session.amount_total} ${session.currency}`,
      expected: `${order.expectedAmountMinor} ${order.expectedCurrency}`,
    };
  }
  return { ok: true };
}

/** Marks a PENDING order `cancelled` when the session expired / payment
 *  failed — guarded, so an already-refunded/paid order is left untouched. */
async function cancelPendingOrder(orderNumber: string | null): Promise<void> {
  if (!orderNumber) return;
  await db
    .update(orders)
    .set({ status: "cancelled" })
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending")));
}

async function handleSessionCompleted(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  const { orderNumber, paymentRef } = sessionRefs(session);

  if (!orderNumber) {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    await sendAdminAlert({
      subject: "Événement Stripe orphelin (checkout.session.completed)",
      body: `session=${session.id} sans client_reference_id ni metadata.orderNumber.\n${JSON.stringify(session.metadata ?? {})}`,
    });
    return;
  }

  /* Wallet top-up — reference looks like "WLD-2026-482913". Re-validate the
   * amount against the recorded deposit before crediting the balance. */
  if (isWalletReference(orderNumber)) {
    const [deposit] = await db
      .select({ amount: walletTransactions.amount })
      .from(walletTransactions)
      .where(and(eq(walletTransactions.reference, orderNumber), eq(walletTransactions.type, "deposit")))
      .limit(1);
    if (!deposit || !deposit.amount) {
      await markWebhookEventUnmatched(PROVIDER, eventId);
      await sendAdminAlert({
        subject: `Dépôt WLD introuvable ${orderNumber}`,
        body: `session=${session.id} crédité via Stripe mais aucun dépôt WLD ${orderNumber} n'existe — montant ${session.amount_total} ${session.currency} à réconcilier manuellement.`,
      });
      return;
    }
    const currency = normalizeCurrency(session.currency ?? "EUR");
    const expected = toMinorUnits(convertFromEur(parseFloat(deposit.amount), currency), currency);
    if (expected != null && (session.amount_total ?? -1) !== expected) {
      await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
      await sendAdminAlert({
        subject: "Dépôt WLD : montant Stripe != montant enregistré",
        body: `reference=${orderNumber}\nchargé=${session.amount_total} ${session.currency}\nattendu=${expected} ${currency}\nAUCUNE crédit appliquée.`,
      });
      return;
    }
    await completeWalletDeposit(orderNumber, (session.payment_intent as string | undefined) ?? session.id);
    await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
    return;
  }

  /* Order — re-validate charged amount before trusting the session. */
  const check = await sessionMatchesExpected(session);
  if (!check.ok) {
    /* Amount/currency mismatch: the money may still be there, but we must
     * not fulfil a payment we cannot account for. Move the order to
     * refund_pending WITHOUT a refund (Stripe already moved the money); an
     * operator investigates. 200 so Stripe doesn't hammer the endpoint. */
    await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
    if (orderNumber) {
      const [cur] = await db.select({ status: orders.status }).from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
      if (cur && cur.status === "pending") {
        await db
          .update(orders)
          .set({
            status: "refund_pending",
            refundReason: check.reason,
            paymentRef: sql`coalesce(${paymentRef ?? null}, payment_ref)`,
          })
          .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending")));
      }
    }
    await sendAdminAlert({
      subject: `Commande ${orderNumber} : ${check.reason === "amount_mismatch" ? "montant différent" : "devise différente"}`,
      body: `Stripe a facturé ${check.charged} alors que la commande attendait ${check.expected}.\nLa commande est passée en refund_pending SANS remboursement automatique — à traiter manuellement.`,
    });
    return;
  }

  /* Payment not (yet) collected — async flows (bank debits, etc.): record
   * the paymentRef now so async_payment_succeeded/failed can find the order,
   * but do NOT mark it paid. */
  if ((session.payment_status ?? "unpaid") !== "paid") {
    if (paymentRef) {
      await db
        .update(orders)
        .set({ paymentRef })
        .where(and(eq(orders.orderNumber, orderNumber), eq(orders.status, "pending")));
    }
    await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
    return;
  }

  /* Payment collected ("paid"): resolve through the shared handler (finalize
   * or definitive-failure → refund_pending → refund). */
  const outcome = await handleConfirmedPayment(orderNumber, paymentRef ?? undefined);
  if (outcome.status === "unmatched") {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    await sendAdminAlert({
      subject: `Paiement Stripe pour commande inconnue ${orderNumber}`,
      body: `session=${session.id}, payment_intent=${paymentRef}. Aucun ordre trouvé — fonds à rechercher manuellement.`,
    });
    return;
  }
  await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
  if (outcome.status === "refund-pending") {
    await sendAdminAlert({
      subject: `Commande ${orderNumber} : remboursement échoué`,
      body: `La commande a été payée puis passée en refund_pending (raison: ${outcome.reason ?? "?"}), mais le remboursement n'a pas abouti (paymentRef introuvable ou API Stripe).`,
    });
  }
}

/** SEPA / async flows: payment eventually succeeded. Locate the order by the
 *  PaymentIntent id recorded at session.completed; verify the amount; finalize. */
async function handleAsyncPaymentSucceeded(pi: Stripe.PaymentIntent, eventId: string): Promise<void> {
  const [order] = await db
    .select({ orderNumber: orders.orderNumber, expectedAmountMinor: orders.expectedAmountMinor, expectedCurrency: orders.expectedCurrency })
    .from(orders)
    .where(eq(orders.paymentRef, pi.id))
    .limit(1);
  if (!order) {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    await sendAdminAlert({
      subject: `async_payment_succeeded sans commande`,
      body: `payment_intent=${pi.id}, montant=${pi.amount} ${pi.currency}. Fond à réconcilier manuellement.`,
    });
    return;
  }
  const mismatch =
    order.expectedAmountMinor != null &&
    order.expectedCurrency &&
    (sameCurrency(order.expectedCurrency, pi.currency) === false || (pi.amount ?? -1) !== order.expectedAmountMinor);

  if (mismatch) {
    const reason = (pi.amount ?? -1) !== order.expectedAmountMinor ? "amount_mismatch" : "currency_mismatch";
    await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
    const [cur] = await db.select({ status: orders.status }).from(orders).where(eq(orders.orderNumber, order.orderNumber)).limit(1);
    if (cur && cur.status === "pending") {
      await db
        .update(orders)
        .set({ status: "refund_pending", refundReason: reason, paymentRef: pi.id })
        .where(and(eq(orders.orderNumber, order.orderNumber), eq(orders.status, "pending")));
    }
    await sendAdminAlert({
      subject: `async_payment_succeeded : montant inattendu`,
      body: `commande=${order.orderNumber}\nchargé=${pi.amount} ${pi.currency}\nattendu=${order.expectedAmountMinor} ${order.expectedCurrency}. refund_pending sans remboursement auto.`,
    });
    return;
  }
  const outcome = await handleConfirmedPayment(order.orderNumber, pi.id);
  if (outcome.status === "unmatched") {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    return;
  }
  await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
}

async function handleAsyncPaymentFailed(pi: Stripe.PaymentIntent, eventId: string): Promise<void> {
  const [order] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.paymentRef, pi.id))
    .limit(1);
  if (!order) {
    await markWebhookEventProcessed(PROVIDER, eventId);
    return;
  }
  await cancelPendingOrder(order.orderNumber);
  await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
}

async function handleSessionExpired(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  const { orderNumber } = sessionRefs(session);
  if (!orderNumber) {
    await markWebhookEventProcessed(PROVIDER, eventId);
    return;
  }
  await cancelPendingOrder(orderNumber);
  await markWebhookEventProcessed(PROVIDER, eventId, orderNumber);
}

/** Locates an order by its PaymentIntent id — the `paymentRef` recorded at
 *  session.completed / async_payment_succeeded and carried on every charge. */
async function findOrderByPaymentRef(paymentRef: string | null | undefined): Promise<(typeof orders.$inferSelect) | null> {
  if (!paymentRef) return null;
  const [order] = await db.select().from(orders).where(eq(orders.paymentRef, paymentRef)).limit(1);
  return order ?? null;
}

/* ------------------------------------------------------------------ */
/*  Refunds & disputes (I6 amendments 3, 6, 11)                       */
/* ------------------------------------------------------------------ */
/*  Key accounting invariant: a refund returns the money to the buyer's card
 *  (Stripe already moved it), so the platform must UN-credit the seller FROM
 *  ITS 80% share. The buyer wallet is NOT touched — Stripe refunds never hit
 *  the wallet. And a lost dispute needs NO refundStripeCharge call: Stripe has
 *  already debited the money back (calling a refund again would lose it a
 *  second time). */

async function handleChargeRefunded(charge: Stripe.Charge, eventId: string): Promise<void> {
  const totalMinor = charge.amount;
  const refundedMinor = charge.amount_refunded ?? totalMinor;

  if (refundedMinor < totalMinor) {
    /* Stripe emits charge.refunded for PARTIAL refunds too. Keep the status —
     * the sale is not fully reversed — and let an operator reconcile. */
    await markWebhookEventProcessed(PROVIDER, eventId);
    await sendAdminAlert({
      subject: "Remboursement partiel Stripe détecté",
      body: `charge=${charge.id}, payment_intent=${charge.payment_intent ?? "?"}.\nA remboursé ${refundedMinor}/${totalMinor} ${(charge.currency ?? "?").toUpperCase()}.\nStatut de la commande CONSERVÉ — réconciliation manuelle requise (I6 amendment 6).`,
    });
    return;
  }

  const paymentRef = (charge.payment_intent as string | undefined) ?? (charge.metadata?.orderNumber ?? null);
  const order = await findOrderByPaymentRef(paymentRef);
  if (!order) {
    await (paymentRef ? markWebhookEventUnmatched(PROVIDER, eventId) : markWebhookEventProcessed(PROVIDER, eventId));
    await sendAdminAlert({
      subject: "charge.refunded sans commande",
      body: `charge=${charge.id}, payment_intent=${charge.payment_intent ?? "?"}.\nRemboursement complet non rattaché — à réconcilier manuellement.`,
    });
    return;
  }

  if (order.status === "refund_pending") {
    /* The money is fully back on the buyer's card AND the photographer was
     * NEVER credited (finalization rolled back): just close the loop to
     * `refunded` — no clawback, no revocation (nothing was issued). */
    await finalizeRefundPendingCharge(order.orderNumber);
    await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
    await sendAdminAlert({
      subject: `Commande ${order.orderNumber} finalement remboursée`,
      body: `charge.refunded reçue pour une commande refund_pending (jamais créditée) — passée au statut refunded sans reprise.`,
    });
    return;
  }

  if (order.status === "refunded") {
    /* Replay of an already-applied full refund — no-op. */
    await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
    return;
  }

  /* Fully refunded FINALIZED order: claw the photographer credits back,
   * revoke the certificates, delete the digital entitlements. */
  const clawback = await clawbackOrderCredits(order.orderNumber);
  await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
  await sendAdminAlert({
    subject: `Commande ${order.orderNumber} remboursée — reprise des soldes`,
    body: `statut → refunded.\nreprise soldes vendeur : ${clawback.clawbackAmount ?? 0} EUR.\ncertificats révoqués : ${clawback.revokedCertificates ?? 0}.\nentitlements supprimés : ${clawback.entitlementsDeleted ?? 0}.`,
  });
}

async function handleDisputeCreated(dispute: Stripe.Dispute, eventId: string): Promise<void> {
  const chargeRef =
    (typeof dispute.payment_intent === "string" ? dispute.payment_intent : null) ??
    (typeof dispute.charge === "string" ? dispute.charge : null) ??
    null;
  const order = await findOrderByPaymentRef(chargeRef);
  if (!order) {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    await sendAdminAlert({
      subject: "Litige Stripe sans commande",
      body: `dispute=${dispute.id}, charge=${chargeRef ?? "?"}, montant=${dispute.amount} ${String(dispute.currency ?? "?").toUpperCase()}. À réconcilier.`,
    });
    return;
  }
  /* Flag the order; the sale stays in its current state while the dispute is
   * open. The flag is lifted when the dispute is won. */
  await db
    .update(orders)
    .set({ disputedAt: new Date() })
    .where(and(eq(orders.orderNumber, order.orderNumber), isNull(orders.disputedAt)));
  await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
  await sendAdminAlert({
    subject: `Litige ouvert sur la commande ${order.orderNumber}`,
    body: `dispute=${dispute.id}, raison=${dispute.reason ?? "?"}, montant=${dispute.amount} ${String(dispute.currency ?? "eur").toUpperCase()}.\nCommande marquée (drapeau litige) — surveillance requise.`,
  });
}

async function handleDisputeClosed(dispute: Stripe.Dispute, eventId: string): Promise<void> {
  const chargeRef =
    (typeof dispute.payment_intent === "string" ? dispute.payment_intent : null) ??
    (typeof dispute.charge === "string" ? dispute.charge : null) ??
    null;
  const order = await findOrderByPaymentRef(chargeRef);
  if (!order) {
    await markWebhookEventUnmatched(PROVIDER, eventId);
    return;
  }

  if (dispute.status !== "lost") {
    /* WON: the funds stay with the platform — lift the flag, never refund,
     * never claw back. The sale remains valid. */
    await db.update(orders).set({ disputedAt: null }).where(eq(orders.orderNumber, order.orderNumber));
    await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);
    await sendAdminAlert({
      subject: `Litige gagné — commande ${order.orderNumber}`,
      body: `dispute=${dispute.id}, statut=${dispute.status}.\nDrapeau litige levé, aucun remboursement ni reprise (les fonds restent acquis).`,
    });
    return;
  }

  /* LOST: Stripe HAS already debited the money back — same flow as a full
   * refund (claw back, revoke, delete entitlements). NO refundStripeCharge:
   * calling it would refund twice. */
  await markWebhookEventProcessed(PROVIDER, eventId, order.orderNumber);

  if (order.status === "refund_pending") {
    await finalizeRefundPendingCharge(order.orderNumber);
    await sendAdminAlert({
      subject: `Litige perdu — commande ${order.orderNumber}`,
      body: `dispute=${dispute.id}. Commande refund_pending finalisée → refunded sans reprise (jamais créditée).`,
    });
    return;
  }
  if (order.status === "refunded") return; /* replay of a previous lost dispute */

  if (!isSaleStatus(order.status)) {
    await sendAdminAlert({
      subject: `Litige perdu sur commande non finalisée ${order.orderNumber}`,
      body: `dispute=${dispute.id}, statut commande=${order.status}. Aucune reprise (jamais finalisée).`,
    });
    return;
  }

  const clawback = await clawbackOrderCredits(order.orderNumber);
  await sendAdminAlert({
    subject: `Litige perdu — commande ${order.orderNumber}`,
    body: `statut → refunded.\nreprise soldes vendeur : ${clawback.clawbackAmount ?? 0} EUR.\ncertificats révoqués : ${clawback.revokedCertificates ?? 0}.\nentitlements supprimés : ${clawback.entitlementsDeleted ?? 0}.`,
  });
}