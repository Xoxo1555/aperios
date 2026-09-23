import "server-only";
import { convertFromEur, toMinorUnits } from "./money";
import { isAirtelMoneyConfigured, disburseAirtelMoney } from "./payments/airtelMoney";
import { isMvolaConfigured, disburseMvolaPayment } from "./payments/mvola";
import { isOrangeMoneyConfigured, disburseOrangeMoney } from "./payments/orangeMoney";
import { isStripeConfigured, createStripePayout } from "./payments/stripe";

/**
 * Automatic payout (withdrawal) dispatch.
 *
 * On `POST /api/payouts` the balance is reserved, then `disbursePayout` calls
 * the chosen operator's money-out API in real time:
 *   - On a successful operator-accepted transfer it resolves `{ ok: true }`
 *     with a provider reference; the payout is marked `completed`.
 *   - If the operator refuses, or the credentials are missing from the
 *     environment, it resolves `{ ok: false, reason }` WITHOUT throwing, so
 *     the route can mark the payout `failed` and refund the reserved balance.
 *
 * This is the clean-fallback contract: a missing operator credential must
 * never silently "succeed" — instead it fails loudly, refunds, and is logged,
 * exactly like an operator rejection.
 */
export interface DisburseInput {
  method:
    | "airtel-money"
    | "mvola"
    | "orange-money"
    | "stripe"
    | "bank-transfer"
    | "paypal";
  amountEur: number;
  account: string;
  reference: string;
}

export type DisburseResult =
  | { ok: true; providerRef: string }
  | { ok: false; reason: string };

export async function disbursePayout(input: DisburseInput): Promise<DisburseResult> {
  switch (input.method) {
    case "airtel-money":
      return run(
        isAirtelMoneyConfigured(),
        "Airtel Money",
        async () => {
          const r = await disburseAirtelMoney({
            amount: toMinorUnits(convertFromEur(input.amountEur, "MGA"), "MGA"),
            msisdn: input.account,
            reference: input.reference,
            transactionId: input.reference,
          });
          return r.providerRef;
        },
      );

    case "mvola":
      return run(
        isMvolaConfigured(),
        "MVola",
        async () => {
          const r = await disburseMvolaPayment({
            amountAr: toMinorUnits(convertFromEur(input.amountEur, "MGA"), "MGA"),
            creditMsisdn: input.account,
            reference: input.reference,
          });
          return r.providerRef;
        },
      );

    case "orange-money":
      return run(
        isOrangeMoneyConfigured(),
        "Orange Money",
        async () => {
          const r = await disburseOrangeMoney({
            amountAr: toMinorUnits(convertFromEur(input.amountEur, "MGA"), "MGA"),
            recipientNumber: input.account,
            reference: input.reference,
          });
          return r.providerRef;
        },
      );

    case "stripe":
      return run(
        isStripeConfigured(),
        "Stripe",
        async () => {
          const r = await createStripePayout({ amountEur: input.amountEur, reference: input.reference });
          return r.providerRef;
        },
      );

    case "bank-transfer":
      return { ok: false, reason: "Le virement bancaire n'est pas automatisé. Traitement manuel requis." };

    case "paypal":
      return { ok: false, reason: "PayPal n'est pas automatisé. Traitement manuel requis." };

    default:
      return { ok: false, reason: "Méthode de retrait non reconnue." };
  }
}

/** Runs a provider disbursement, catching errors and mapping missing config. */
async function run(
  configured: boolean,
  label: string,
  fn: () => Promise<string>,
): Promise<DisburseResult> {
  if (!configured) {
    return {
      ok: false,
      reason: `Les identifiants ${label} ne sont pas configurés sur cette instance. Retrait annulé et solde remboursé.`,
    };
  }
  try {
    const providerRef = await fn();
    return { ok: true, providerRef };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[payout] ${label} a échoué`, err);
    return { ok: false, reason };
  }
}