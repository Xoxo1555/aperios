import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import {
  createWalletDepositIntent,
  failWalletDeposit,
  setWalletDepositIntentProviderRef,
  WALLET_DEPOSIT_MAX,
  WALLET_DEPOSIT_MIN,
  type WalletPaymentMethod,
} from "lib/wallet";
import { createStripeCheckoutSession, isStripeConfigured } from "lib/payments/stripe";
import {
  createOrangeMoneyPayment,
  isOrangeMoneyConfigured,
} from "lib/payments/orangeMoney";
import { initiateMvolaPayment, isMvolaConfigured } from "lib/payments/mvola";
import { initiateAirtelMoneyPayment, isAirtelMoneyConfigured } from "lib/payments/airtelMoney";
import { convertTotals, normalizeCurrency, toMinorUnits } from "lib/money";
import { walletDepositSchema } from "lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallet/deposit — start a wallet top-up.
 *
 * Body: { amount, paymentMethod: "stripe" | "orange_money" | "mvola" |
 *              "airtel_money", phone?, currency? }
 *
 *  - Requires a valid signed session.
 *  - Validates amount (5 € min, 1 000 € max) server-side; the client never
 *    sets its own balance.
 *  - Records a PENDING deposit intent (NOT a ledger row), then opens a real
 *    payment: Stripe Checkout (hosted URL), Orange Money web payment
 *    (redirect), or an MVola / Airtel collection request (confirmed on the
 *    phone).
 *  - The `wallet_transactions` row is inserted (already `completed`) and the
 *    balance is credited ONLY by the verified webhook (or admin
 *    reconciliation) — never by this response.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = walletDepositSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const amount = Math.round(body.amount * 100) / 100;

  if (amount < WALLET_DEPOSIT_MIN) {
    return NextResponse.json(
      { error: `Montant minimum : ${WALLET_DEPOSIT_MIN} €.` },
      { status: 400 },
    );
  }
  if (amount > WALLET_DEPOSIT_MAX) {
    return NextResponse.json(
      { error: `Montant maximum : ${WALLET_DEPOSIT_MAX} €.` },
      { status: 400 },
    );
  }

  const method = body.paymentMethod as WalletPaymentMethod;
  const currency = normalizeCurrency(body.currency);

  // Mobile Money confirmation is initiated from the customer's phone.
  if ((method === "mvola" || method === "airtel_money") && !body.phone) {
    return NextResponse.json(
      { error: "Le numéro de téléphone est requis pour le Mobile Money." },
      { status: 400 },
    );
  }

  const origin = req.nextUrl.origin;

  /* ---------------- Card via Stripe Checkout ---------------- */
  if (method === "stripe") {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Le paiement par carte n'est pas encore configuré sur cette instance (STRIPE_SECRET_KEY manquante). Contactez l'administrateur ou choisissez le Mobile Money.",
          code: "STRIPE_NOT_CONFIGURED",
        },
        { status: 501 },
      );
    }

    let intent;
    try {
      intent = await createWalletDepositIntent({ userId: user.id, amount, paymentMethod: method });
    } catch (err) {
      console.error("[wallet/deposit] create intent", err);
      return NextResponse.json({ error: "Impossible d'initier le dépôt." }, { status: 500 });
    }

    try {
      const converted = convertTotals({ subtotal: amount, shipping: 0, tax: 0, total: amount }, currency);
      const session = await createStripeCheckoutSession({
        orderNumber: intent.reference,
        amountCents: toMinorUnits(converted.total, currency),
        currency: converted.currency,
        customerEmail: user.email,
        description: `Aperio — dépôt de portefeuille (${intent.reference})`,
        successUrl: `${origin}/wallet?deposit=success&reference=${intent.reference}`,
        cancelUrl: `${origin}/wallet?deposit=cancelled`,
        metadata: { type: "wallet_deposit" },
      });
      await setWalletDepositIntentProviderRef(intent.reference, session.id);

      return NextResponse.json({ url: session.url, reference: intent.reference }, { status: 201 });
    } catch (err) {
      console.error("[wallet/deposit][stripe]", err);
      await failWalletDeposit(intent.reference).catch(() => undefined);
      return NextResponse.json(
        { error: "Le service de paiement Stripe est momentanément indisponible." },
        { status: 502 },
      );
    }
  }

  /* ---------------- Mobile Money ---------------- */
  let intent;
  try {
    intent = await createWalletDepositIntent({ userId: user.id, amount, paymentMethod: method });
  } catch (err) {
    console.error("[wallet/deposit] create intent", err);
    return NextResponse.json({ error: "Impossible d'initier le dépôt." }, { status: 500 });
  }

  const converted = convertTotals({ subtotal: amount, shipping: 0, tax: 0, total: amount }, currency);
  const convertedTotal = toMinorUnits(converted.total, currency);
  const reference = intent.reference;

  /* Orange Money — hosted web-payment page (no phone needed). */
  if (method === "orange_money" && isOrangeMoneyConfigured()) {
    try {
      const result = await createOrangeMoneyPayment({
        orderId: reference,
        amount: convertedTotal,
        currency: converted.currency,
        returnUrl: `${origin}/wallet?deposit=success&reference=${reference}`,
        cancelUrl: `${origin}/wallet?deposit=cancelled`,
        notifUrl: `${origin}/api/webhooks/orange-money`,
        reference,
      });
      await setWalletDepositIntentProviderRef(reference, result.payToken);
      return NextResponse.json({ mode: "redirect", url: result.paymentUrl, reference }, { status: 201 });
    } catch (err) {
      console.error("[wallet/deposit][orange]", err);
    }
  }

  /* MVola (Yas) — async merchant-pay, customer confirms on their phone. */
  if (method === "mvola" && isMvolaConfigured()) {
    try {
      const result = await initiateMvolaPayment({
        amountAr: convertedTotal,
        debitMsisdn: body.phone!,
        description: `Aperio dépôt ${reference}`,
        reference,
        callbackUrl: `${origin}/api/webhooks/mvola`,
      });
      await setWalletDepositIntentProviderRef(reference, result.serverCorrelationId);
      return NextResponse.json(
        { mode: "pending_customer_confirmation", reference, providerRef: result.serverCorrelationId },
        { status: 201 },
      );
    } catch (err) {
      console.error("[wallet/deposit][mvola]", err);
    }
  }

  /* Airtel Money — collection request, customer authorizes via PIN prompt. */
  if (method === "airtel_money" && isAirtelMoneyConfigured()) {
    try {
      const result = await initiateAirtelMoneyPayment({
        amount: convertedTotal,
        msisdn: body.phone!,
        reference,
        transactionId: reference,
      });
      await setWalletDepositIntentProviderRef(reference, result.transactionId);
      return NextResponse.json(
        { mode: "pending_customer_confirmation", reference, providerRef: result.transactionId },
        { status: 201 },
      );
    } catch (err) {
      console.error("[wallet/deposit][airtel]", err);
    }
  }

  /* No live merchant credentials configured for this operator yet (or the
   * live call failed): keep the deposit pending and give the buyer manual
   * instructions. An administrator reconciles it afterwards, exactly like
   * the order checkout flow — the deposit is never credited just by showing
   * this message, only by a verified webhook or admin confirmation. */
  return NextResponse.json(
    {
      mode: "manual_confirmation",
      reference,
      amount: converted.total,
      currency: converted.currency,
      instructions:
        method === "orange_money"
          ? `Composez #144# sur votre téléphone Orange, choisissez "Payer marchand" et indiquez la référence ${reference}.`
          : method === "mvola"
          ? `Composez *111# sur votre téléphone Yas (Mvola), choisissez "Paiement marchand" et indiquez la référence ${reference}.`
          : `Composez *432# sur votre téléphone Airtel, choisissez "Payer" et indiquez la référence ${reference}.`,
    },
    { status: 202 },
  );
}