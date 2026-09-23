import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "db";
import { orders, type RefundReason } from "db/schema";
import { getSessionUser } from "lib/auth";
import { refundOrderToRefunded } from "lib/orders";

export const dynamic = "force-dynamic";

/** Raised when a reason should NOT be re-disbursed automatically: an
 *  amount/currency mismatch means the operator collected the wrong amount —
 *  the refund must be done manually on the operator side, not via the API. */
const INELIGIBLE_REASONS = new Set<RefundReason>(["amount_mismatch", "currency_mismatch"]);

/**
 * Admin retry of a pending operator refund (I6 étape 3). When a Mobile Money
 * payment failed to finalize (or arrived on a cancelled order), the order
 * sits in `refund_pending` waiting for a MANUAL operator refund — there is
 * nothing to auto-credit. This route re-runs the shared Stripe refund path
 * (`refundOrderToRefunded`, idempotent via the `refund-<orderNumber>` key) so
 * a transient API/network failure during the FIRST webhook can be retried
 * without ever double-reimbursing.
 *
 * Guards: admin only (401 / 403), order must be `refund_pending` without a
 * `refund_id`, and the reason must be eligible — otherwise 409/422 with an
 * explicit code. A refund API failure answers 502 so the caller retries.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { orderNumber } = await params;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order) {
    return NextResponse.json({ error: "Commande introuvable.", code: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  if (order.status === "refunded") {
    return NextResponse.json({
      ok: true,
      status: "already-refunded",
      message: "Cette commande a déjà été remboursée.",
      refundId: order.refundId,
      order,
    });
  }
  if (order.status !== "refund_pending") {
    return NextResponse.json(
      { error: "Retry-refund uniquement pour une commande en refund_pending.", code: "NOT_REFUND_PENDING" },
      { status: 409 },
    );
  }
  if (order.refundId) {
    return NextResponse.json({
      ok: true,
      status: "already-refunded",
      message: "Un remboursement a déjà été émis pour cette commande.",
      refundId: order.refundId,
      order,
    });
  }
  if (order.refundReason != null && INELIGIBLE_REASONS.has(order.refundReason as RefundReason)) {
    return NextResponse.json(
      {
        error: "Raison de refund inéligible au retry : remboursement opérateur manuel requis.",
        code: "REFUND_REASON_NOT_ELIGIBLE",
        reason: order.refundReason,
      },
      { status: 422 },
    );
  }
  if (!order.paymentRef) {
    return NextResponse.json(
      { error: "Pas de référence de paiement — remboursement opérateur manuel requis.", code: "MISSING_PAYMENT_REF" },
      { status: 409 },
    );
  }

  try {
    const outcome = await refundOrderToRefunded(orderNumber);
    if (outcome.status === "refunded" || outcome.status === "already-refunded") {
      return NextResponse.json({
        ok: true,
        status: outcome.status,
        refundId: outcome.refundId ?? null,
        order: outcome.order ?? order,
      });
    }
    return NextResponse.json(
      { error: "Le remboursement n'a pas pu être émis.", code: "REFUND_API_FAILED", detail: outcome.status },
      { status: 502 },
    );
  } catch (err) {
    console.error("[admin/orders/retry-refund]", err);
    return NextResponse.json({ error: "Échec du retry-refund.", code: "REFUND_API_FAILED" }, { status: 502 });
  }
}