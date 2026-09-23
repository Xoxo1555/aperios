import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "db";
import { orders } from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lists the current user's own orders. Order creation now happens
 * exclusively through the real payment flows:
 *   - POST /api/checkout/stripe        (card, via Stripe Checkout)
 *   - POST /api/checkout/mobile-money  (Orange Money / MVola / Airtel Money)
 * An order is only ever marked "paid" by a verified payment confirmation
 * (Stripe webhook, Mobile Money callback, or explicit admin reconciliation),
 * never directly by the client.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  return NextResponse.json({
    orders: rows.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      currency: o.currency,
      paymentProvider: o.paymentProvider,
      createdAt: o.createdAt,
    })),
  });
}
