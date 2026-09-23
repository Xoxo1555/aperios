import "server-only";
import Stripe from "stripe";

/**
 * Real Stripe integration using the official SDK.
 * Activate by setting STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the
 * webhook endpoint) in the environment. Without a key, card checkout is
 * disabled and the API returns a clear configuration error rather than
 * pretending the payment succeeded.
 */

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY n'est pas configurée.");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

export interface CreateStripeSessionInput {
  orderNumber: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Extra metadata merged into the session (used to tag wallet deposits). */
  metadata?: Record<string, string>;
}

/** Creates a real Stripe Checkout Session and returns its hosted payment URL. */
export async function createStripeCheckoutSession(
  input: CreateStripeSessionInput,
): Promise<{ id: string; url: string }> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: input.customerEmail,
    client_reference_id: input.orderNumber,
    line_items: [
      {
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountCents,
          product_data: { name: input.description },
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { orderNumber: input.orderNumber, ...input.metadata },
  });
  if (!session.url) throw new Error("Stripe n'a pas retourné d'URL de paiement.");
  return { id: session.id, url: session.url };
}

/** Verifies the raw webhook payload signature and parses the Stripe event. */
export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET n'est pas configurée.");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Initiates a real Stripe Payout to the platform (or connected) account's
 * default bank/balance. Throws when Stripe isn't configured or the payout is
 * refused, so the caller can refund the balance and mark the payout failed.
 */
export async function createStripePayout(input: {
  amountEur: number;
  reference: string;
}): Promise<{ providerRef: string }> {
  const stripe = getStripeClient();
  const payout = await stripe.payouts.create({
    amount: Math.round(input.amountEur * 100),
    currency: "eur",
    description: `Aperio payout ${input.reference}`,
    statement_descriptor: "APERIO PAY",
  });
  return { providerRef: payout.id };
}

/* ------------------------------------------------------------------ */
/*  Refunds (idempotent charges refunds)                                */
/* ------------------------------------------------------------------ */

/**
 * A refund is a real Stripe API call and must NEVER run inside a database
 * transaction (amendment I6-1). It is made idempotent by an explicit
 * Stripe idempotency key derived from the order number, so a webhook replay
 * can never produce two refunds for the same order.
 */
export interface StripeRefundInput {
  orderNumber: string;
  paymentRef: string;
  idempotencyKey: string;
  reason?: "requested_by_customer" | "fraudulent" | "duplicate";
}

/** Test seam: injects a fake charge-refund client. Strictly forbidden in
 *  production — a production process must ALWAYS use the real Stripe API. */
type RefundFn = (input: StripeRefundInput) => Promise<{ refundId: string }>;
let refundOverride: RefundFn | null = null;

export function setStripeRefundOverride(fn: RefundFn): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setStripeRefundOverride() est interdit en production.");
  }
  refundOverride = fn;
}

export function clearStripeRefundOverride(): void {
  refundOverride = null;
}

/**
 * Refunds the charge behind a Stripe payment reference (the PaymentIntent id
 * recorded at `checkout.session.completed`). Idempotent at the Stripe level:
 * replaying the same order reuses the same `refund-<orderNumber>` key and
 * Stripe returns the EXACT same refund (never a double reimbursement).
 * Throws when the API call fails — the caller keeps the order in
 * `refund_pending` and the webhook returns 5xx so it is retried.
 */
export async function refundStripeCharge(
  input: StripeRefundInput,
): Promise<{ refundId: string }> {
  if (refundOverride) return refundOverride(input);
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentRef,
      reason: input.reason,
      metadata: { orderNumber: input.orderNumber },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { refundId: refund.id };
}
