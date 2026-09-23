import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { orders } from "db/schema";
import { getSessionUser } from "lib/auth";
import { createDigitalOrder, OrderError } from "lib/orders";
import { createStripeCheckoutSession, isStripeConfigured } from "lib/payments/stripe";
import { convertTotals, normalizeCurrency, toMinorUnits } from "lib/money";
import { digitalLicenseSchema } from "lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout — digital HD license checkout.
 *
 * Body: { photoId: number, licenseType: "commercial" | "personal" }
 *
 *  - Requires a valid signed session (verified via lib/session.ts).
 *  - Re-validates the photo against the database (exists, published, HD source
 *    available) and never trusts a client-supplied price.
 *  - Creates a PENDING digital order, then opens a real Stripe Checkout
 *    session. The order is only marked "completed" by the verified Stripe
 *    webhook — never by this response.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Le paiement par carte n'est pas encore configuré sur cette instance (STRIPE_SECRET_KEY manquante).",
        code: "STRIPE_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = digitalLicenseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const currency = normalizeCurrency(body.currency);

  try {
    const { order, amount } = await createDigitalOrder({
      userId: user.id,
      photoId: body.photoId,
      licenseType: body.licenseType,
      paymentProvider: "stripe",
      currency,
    });

    const converted = convertTotals({ subtotal: amount, shipping: 0, tax: 0, total: amount }, currency);

    /* Record the exact expected charge so the confirmation webhook can
     * re-validate the session amount (I6 amendment 4). */
    await db
      .update(orders)
      .set({
        expectedAmountMinor: toMinorUnits(converted.total, currency),
        expectedCurrency: currency,
      })
      .where(eq(orders.orderNumber, order.orderNumber));

    const origin = req.nextUrl.origin;
    const session = await createStripeCheckoutSession({
      orderNumber: order.orderNumber,
      amountCents: toMinorUnits(converted.total, currency),
      currency: converted.currency,
      customerEmail: user.email,
      description: `Aperio — licence numérique HD (commande ${order.orderNumber})`,
      successUrl: `${origin}/checkout/success?order=${order.orderNumber}`,
      cancelUrl: `${origin}/checkout?cancelled=1`,
    });

    return NextResponse.json({ url: session.url, orderNumber: order.orderNumber }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[checkout]", err);
    return NextResponse.json(
      { error: "Le service de paiement Stripe est momentanément indisponible." },
      { status: 502 },
    );
  }
}