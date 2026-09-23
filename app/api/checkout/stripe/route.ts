import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { orders } from "db/schema";
import { getSessionUser } from "lib/auth";
import { createPendingOrder, OrderError } from "lib/orders";
import { createStripeCheckoutSession, isStripeConfigured } from "lib/payments/stripe";
import { convertTotals, normalizeCurrency, toMinorUnits } from "lib/money";
import { checkoutSchema } from "lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

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

  const raw = await req.json().catch(() => ({}));
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const currency = normalizeCurrency(body.currency);

  try {
    const { order, totals } = await createPendingOrder({
      userId: user.id,
      items: body.items.map((i) => ({
        photoId: i.photoId,
        sizeId: i.sizeId ?? null,
        mountId: i.mountId ?? null,
        qty: i.qty,
      })),
      shipping: { name: body.shipName, email: body.shipEmail, address: body.shipAddress ?? {} },
      paymentMethod: "card",
      paymentProvider: "stripe",
      currency,
    });

    // Convert the canonical EUR totals into the buyer's selected currency for
    // the Stripe charge (amounts are re-validated server-side on webhook).
    const converted = convertTotals(totals, currency);

    /* Record the EXACT minor-amount + currency the charge must carry, so the
     * confirmation webhook can refuse a session that charged a different sum
     * (I6 amendment 4 — never trust the session amount blindly). */
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
      description: `Commande Aperio ${order.orderNumber} — tirages d'art en édition limitée`,
      successUrl: `${origin}/checkout/success?order=${order.orderNumber}`,
      cancelUrl: `${origin}/checkout?cancelled=1`,
    });

    return NextResponse.json({ url: session.url, orderNumber: order.orderNumber }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[checkout/stripe]", err);
    return NextResponse.json({ error: "Le service de paiement Stripe est momentanément indisponible." }, { status: 502 });
  }
}
