import { and, eq } from "drizzle-orm";
import { db } from "db";
import { orders } from "db/schema";
import {
  handleConfirmedPayment,
  markOrderRefundPendingAfterCancellation,
} from "./orders";
import { completeWalletDeposit, failWalletDeposit, isWalletReference } from "./wallet";
import { sendAdminAlert } from "./admin-alert";
import {
  claimWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventUnmatched,
  noteWebhookEventError,
  type WebhookProvider,
} from "./webhook-events";

/**
 * Shared Mobile Money confirmation logic (Orange Money / MVola / Airtel
 * Money) — I6 amendments 4/8 + étape 3 (operator DEFINITIVE failure and
 * late success):
 *
 *  - the event is deduplicated upfront via webhook_events (a replay becomes a
 *    200 no-op);
 *  - a confirmed order goes through the SAME resolver as Stripe
 *    (handleConfirmedPayment) but with `skipRefund`: a definitive failure
 *    (stock exhausted / collision) moves the order to `refund_pending` with
 *    its reason and raises an operator alert — the operator refund is a
 *    MANUAL act (no Stripe refund call for a Mobile Money transaction), so
 *    we never pretend the money is back on its own;
 *  - a SUCCESS arriving on an order the platform already CANCELLED (late
 *    success) is detected and moves the order to `refund_pending`
 *    (reason `order_cancelled_after_payment`) + operator alert: the money
 *    landed on a cancelled order, it must be returned manually;
 *  - a DEFINITIVE FAILURE (statusKind "failure"):
 *      · pending order → cancelled, NO credit, NO refund (nothing was charged),
 *      · already-cancelled → processed no-op,
 *      · paid/refund order → audit + alert, the sale is NEVER cancelled;
 *  - a wallet top-up failure marks the deposit "failed" (no credit);
 *  - a transient (non-confirming) status ("other") is recorded, no effect;
 *  - an unknown order is recorded as `unmatched` and alerted (200);
 *  - a transient (non-OrderError) failure records the error and returns 500
 *    so the operator's callback system retries — safe thanks to the dedup.
 */
export interface MobileMoneyConfirmOutput {
  status: 200 | 500;
  action?:
    | "finalized"
    | "already-finalized"
    | "refund-pending"
    | "refunded"
    | "unmatched"
    | "refund-pending-late-success"
    | "cancelled"
    | "already-handled-failure"
    | "deposit-failed";
}

const ORANGE = "orange_money" as const;
const PROVIDER_BY_REF = new Map<string, WebhookProvider>([
  ["orange-money", "orange_money"],
  ["mvola", "mvola"],
  ["airtel-money", "airtel_money"],
]);

export async function handleMobileMoneyConfirmation(input: {
  provider: "orange-money" | "mvola" | "airtel-money";
  /** Synthesized event id — `${provider}:${reference}:${status}` — unique per
   *  notified status of a transaction (a "failed" then "success" callback
   *  for the SAME reference are two distinct events). */
  eventId: string;
  reference: string;
  providerRef: string | null;
  /** Final classification of the notified status: "success" (money moved),
   *  "failure" (definitive operator rejection) or "other" (transient /
   *  pending / unknown — audit only). */
  statusKind: "success" | "failure" | "other";
  payload?: unknown;
}): Promise<MobileMoneyConfirmOutput> {
  const provider: WebhookProvider = PROVIDER_BY_REF.get(input.provider) ?? ORANGE;

  if (input.statusKind === "failure") {
    return handleProviderFailure(input, provider);
  }
  if (input.statusKind === "other") {
    /* Non-confirming callback (pending / unknown state…): audit record only,
     * no side effect on the order. */
    const claim = await claimWebhookEvent(provider, input.eventId, input.payload);
    if (claim.status !== "new") return { status: 200 };
    await markWebhookEventProcessed(provider, input.eventId);
    return { status: 200 };
  }

  const claim = await claimWebhookEvent(provider, input.eventId, input.payload);
  if (claim.status === "already-processed") return { status: 200 };

  try {
    /* Wallet top-up (WLD-…) never touches orders: complete the deposit. */
    if (isWalletReference(input.reference)) {
      await completeWalletDeposit(input.reference, input.providerRef);
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return { status: 200, action: "finalized" };
    }

    const outcome = await handleConfirmedPayment(input.reference, input.providerRef ?? undefined, {
      skipRefund: true,
    });

    if (outcome.status === "unmatched") {
      await markWebhookEventUnmatched(provider, input.eventId);
      await sendAdminAlert({
        subject: `Paiement ${input.provider} pour commande inconnue ${input.reference}`,
        body: `Aucun ordre ne correspond à la référence ${input.reference} — fonds à rechercher manuellement (ref fournisseur: ${input.providerRef ?? "?"}).`,
      });
      return { status: 200, action: "unmatched" };
    }

    if (outcome.status === "refund-pending") {
      await sendAdminAlert({
        subject: `Commande ${input.reference} : paiement ${input.provider} impossible à traiter`,
        body: `La commande a été payée mais sa finalisation a échoué (raison: ${outcome.reason ?? "?"}). Elle est en refund_pending — un remboursement opérateur MANUEL est requis.`,
      });
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return { status: 200, action: "refund-pending" };
    }

    /* Succès tardif : le fournisseur confirme un paiement sur une commande
     * que la plateforme a déjà ANNULÉE — l'argent est perdu sans action de
     * l'opérateur. Passage en refund_pending (remboursement opérateur
     * manuel) + alerte ; jamais de re-crédit (finalisation impossible). */
    if (outcome.status === "already-finalized" && outcome.order?.status === "cancelled") {
      await markOrderRefundPendingAfterCancellation(
        input.reference,
        "order_cancelled_after_payment",
        input.providerRef ?? undefined,
      );
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      await sendAdminAlert({
        subject: `Commande ${input.reference} : paiement ${input.provider} reçu APRÈS annulation`,
        body: `La commande avait été annulée avant la confirmation du paiement. Elle est passée en refund_pending (raison: order_cancelled_after_payment) — un remboursement opérateur MANUEL est requis (ref fournisseur: ${input.providerRef ?? "?"}).`,
      });
      return { status: 200, action: "refund-pending-late-success" };
    }

    if (outcome.status === "already-finalized" && outcome.order?.status === "refunded") {
      /* Déjà remboursée (replay d'un remboursement déjà finalisé) : no-op. */
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return { status: 200, action: "refunded" };
    }

    await markWebhookEventProcessed(provider, input.eventId, input.reference);
    return { status: 200, action: outcome.status === "finalized" ? "finalized" : "already-finalized" };
  } catch (err) {
    await noteWebhookEventError(provider, input.eventId, err, input.reference);
    console.error(`[webhooks/${input.provider}] échec de traitement`, input.eventId, err);
    return { status: 500 };
  }
}

/** Branch "failure" (statut définitif rejeté par l'opérateur). */
async function handleProviderFailure(
  input: {
    provider: "orange-money" | "mvola" | "airtel-money";
    eventId: string;
    reference: string;
    providerRef: string | null;
    payload?: unknown;
  },
  provider: WebhookProvider,
): Promise<MobileMoneyConfirmOutput> {
  const claim = await claimWebhookEvent(provider, input.eventId, input.payload);
  if (claim.status !== "new") return { status: 200 };

  try {
    /* Échec d'un dépôt wallet : marqué failed, aucun crédit. */
    if (isWalletReference(input.reference)) {
      await failWalletDeposit(input.reference);
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return { status: 200, action: "deposit-failed" };
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, input.reference))
      .limit(1);

    if (!order) {
      /* Référence inconnue : aucun argent perdu — audit silencieux. */
      await markWebhookEventProcessed(provider, input.eventId);
      return { status: 200 };
    }

    if (order.status === "pending") {
      /* Paiement refusé par l'opérateur : la commande n'a JAMAIS été payée.
       * On l'annule proprement — aucun crédit, aucun remboursement, et les
       * tirages réservés sont libérés. */
      const [cancelled] = await db
        .update(orders)
        .set({ status: "cancelled" })
        .where(and(eq(orders.orderNumber, input.reference), eq(orders.status, "pending")))
        .returning();
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return {
        status: 200,
        action: cancelled ? "cancelled" : "already-finalized",
      };
    }

    if (order.status === "cancelled") {
      /* Déjà annulée (replay / doublon) : no-op. */
      await markWebhookEventProcessed(provider, input.eventId, input.reference);
      return { status: 200, action: "cancelled" };
    }

    /* La commande est payée / remboursée : un échec APRÈS un succès est
     * contradictoire — audit + alerte. JAMAIS d'annulation d'une vente. */
    await markWebhookEventProcessed(provider, input.eventId, input.reference);
    await sendAdminAlert({
      subject: `Contradiction de paiement ${input.provider} pour ${input.reference}`,
      body: `Un statut d'échec opérateur est arrivé pour une commande déjà au statut "${order.status}". La vente n'est PAS annulée — vérifier manuellement (ref fournisseur: ${input.providerRef ?? "?"}).`,
    });
    return { status: 200, action: "already-handled-failure" };
  } catch (err) {
    await noteWebhookEventError(provider, input.eventId, err, input.reference);
    console.error(`[webhooks/${input.provider}] échec de traitement`, input.eventId, err);
    return { status: 500 };
  }
}