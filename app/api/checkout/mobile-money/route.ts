import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { createPendingOrder, OrderError } from "lib/orders";
import { createOrangeMoneyPayment, isOrangeMoneyConfigured } from "lib/payments/orangeMoney";
import { initiateMvolaPayment, isMvolaConfigured } from "lib/payments/mvola";
import { initiateAirtelMoneyPayment, isAirtelMoneyConfigured } from "lib/payments/airtelMoney";
import { convertTotals, normalizeCurrency, toMinorUnits } from "lib/money";
import { db } from "db";
import { orders } from "db/schema";
import { eq } from "drizzle-orm";
import { mobileMoneyCheckoutSchema } from "lib/validation";

export const dynamic = "force-dynamic";

const PROVIDERS = ["orange-money", "mvola", "airtel-money"] as const;
type Provider = (typeof PROVIDERS)[number];

/** Madagascar mobile numbers: 03X XX XXX XX (10 digits, starts with 03). */
const MG_PHONE_RE = /^0?3[2-9]\d{7}$/;

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^261/, "0");
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = mobileMoneyCheckoutSchema.safeParse({
    ...raw,
    phone: normalizePhone(String(raw.phone ?? "")),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const provider = body.provider as Provider;
  const phone = body.phone;
  const currency = normalizeCurrency(body.currency);

  let order;
  let totals;
  try {
    const created = await createPendingOrder({
      userId: user.id,
      items: body.items.map((i) => ({
        photoId: i.photoId,
        sizeId: i.sizeId ?? null,
        mountId: i.mountId ?? null,
        qty: i.qty,
      })),
      shipping: { name: body.shipName, email: body.shipEmail, address: body.shipAddress ?? {} },
      paymentMethod: provider,
      paymentProvider: provider,
      currency,
    });
    order = created.order;
    totals = created.totals;
  } catch (err) {
    if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[checkout/mobile-money]", err);
    return NextResponse.json({ error: "Impossible de créer la commande." }, { status: 500 });
  }

  // Convert the canonical EUR totals into the buyer's selected currency for
  // the Mobile Money charge and the manual-payment instructions.
  const converted = convertTotals(totals, currency);
  const convertedTotal = toMinorUnits(converted.total, currency);

  const origin = req.nextUrl.origin;
  const reference = order.orderNumber;

  /* Orange Money — real Web Payment API, redirect to a hosted payment page */
  if (provider === "orange-money" && isOrangeMoneyConfigured()) {
    try {
      const result = await createOrangeMoneyPayment({
        orderId: reference,
        amount: convertedTotal,
        currency: converted.currency,
        returnUrl: `${origin}/checkout/success?order=${reference}`,
        cancelUrl: `${origin}/checkout?cancelled=1`,
        notifUrl: `${origin}/api/webhooks/orange-money`,
        reference,
      });
      await db
        .update(orders)
        .set({
          paymentRef: result.payToken,
          expectedAmountMinor: convertedTotal,
          expectedCurrency: converted.currency,
        })
        .where(eq(orders.id, order.id));
      return NextResponse.json({ mode: "redirect", url: result.paymentUrl, orderNumber: reference }, { status: 201 });
    } catch (err) {
      console.error("[checkout/mobile-money][orange]", err);
      // fall through to the manual/pending flow below rather than failing the order outright
    }
  }

  /* MVola (Yas) — real async merchant-pay API, customer confirms on their phone */
  if (provider === "mvola" && isMvolaConfigured()) {
    try {
      const result = await initiateMvolaPayment({
        amountAr: convertedTotal,
        debitMsisdn: phone,
        description: `Aperio ${reference}`,
        reference,
        callbackUrl: `${origin}/api/webhooks/mvola`,
      });
      await db
        .update(orders)
        .set({
          paymentRef: result.serverCorrelationId,
          expectedAmountMinor: convertedTotal,
          expectedCurrency: converted.currency,
        })
        .where(eq(orders.id, order.id));
      return NextResponse.json(
        { mode: "pending_customer_confirmation", orderNumber: reference, reference: result.serverCorrelationId },
        { status: 201 },
      );
    } catch (err) {
      console.error("[checkout/mobile-money][mvola]", err);
    }
  }

  /* Airtel Money — real collection API, customer authorizes via PIN prompt */
  if (provider === "airtel-money" && isAirtelMoneyConfigured()) {
    try {
      const result = await initiateAirtelMoneyPayment({
        amount: convertedTotal,
        msisdn: phone,
        reference,
        transactionId: reference,
      });
      await db
        .update(orders)
        .set({
          paymentRef: result.transactionId,
          expectedAmountMinor: convertedTotal,
          expectedCurrency: converted.currency,
        })
        .where(eq(orders.id, order.id));
      return NextResponse.json(
        { mode: "pending_customer_confirmation", orderNumber: reference, reference: result.transactionId },
        { status: 201 },
      );
    } catch (err) {
      console.error("[checkout/mobile-money][airtel]", err);
    }
  }

  /* No live merchant credentials configured for this operator yet (or the
   * live call failed): keep the order valid and pending, and give the buyer
   * clear instructions to complete payment manually. An administrator (or a
   * future webhook once credentials are added) reconciles it afterwards —
   * this mirrors how most Malagasy merchants operate today pending a
   * dedicated aggregator contract, and avoids ever telling the customer
   * their payment succeeded when it has not been verified. */
  await db
    .update(orders)
    .set({
      expectedAmountMinor: convertedTotal,
      expectedCurrency: converted.currency,
    })
    .where(eq(orders.id, order.id));
  return NextResponse.json(
    {
      mode: "manual_confirmation",
      orderNumber: reference,
      amount: converted.total,
      currency: converted.currency,
      instructions:
        provider === "orange-money"
          ? `Composez #144# sur votre téléphone Orange, choisissez "Payer marchand" et indiquez la référence ${reference}.`
          : provider === "mvola"
          ? `Composez *111# sur votre téléphone Yas (Mvola), choisissez "Paiement marchand" et indiquez la référence ${reference}.`
          : `Composez *432# sur votre téléphone Airtel, choisissez "Payer" et indiquez la référence ${reference}.`,
    },
    { status: 202 },
  );
}
