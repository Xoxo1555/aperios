import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { handleConfirmedPayment } from "lib/orders";

export const dynamic = "force-dynamic";

/**
 * Manual payment reconciliation for admins. Used when a Mobile Money
 * operator isn't yet wired to a live webhook — the administrator verifies
 * the funds were received and confirms the order here.
 *
 * This route runs the EXACT same shared resolver as the webhooks
 * (handleConfirmedPayment): a confirmed order that cannot be fulfilled
 * (edition stock exhausted, numbering collision…) follows the same path —
 * the order moves to `refund_pending` with its reason and a Stripe refund is
 * attempted — and the admin response EXPLAINS what happened instead of a
 * bare 500. Never a fake "ok" on a payment that was actually refunded.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { orderNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const paymentRef = typeof body.paymentRef === "string" && body.paymentRef ? body.paymentRef : undefined;

  try {
    const outcome = await handleConfirmedPayment(orderNumber, paymentRef);

    switch (outcome.status) {
      case "finalized":
        return NextResponse.json({
          ok: true,
          status: "finalized",
          order: outcome.order,
          alreadyFinalized: false,
        });
      case "already-finalized":
        return NextResponse.json({
          ok: true,
          status: "already-finalized",
          message: "Cette commande a déjà été confirmée.",
          order: outcome.order,
          alreadyFinalized: true,
        });
      case "refunded":
        return NextResponse.json({
          ok: true,
          status: "refunded",
          message: "La commande a été payée mais son traitement a échoué — le remboursement a été émis.",
          reason: outcome.reason,
          refundId: outcome.refundId,
          order: outcome.order,
        });
      case "refund-pending":
        return NextResponse.json({
          ok: true,
          status: "refund-pending",
          message:
            "La commande a été payée mais son traitement a échoué — le remboursement est en attente (à traiter).",
          reason: outcome.reason,
          order: outcome.order,
        });
      case "unmatched":
        return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
      default:
        return NextResponse.json(
          { error: "Cette commande ne peut pas être confirmée dans son état actuel." },
          { status: 409 },
        );
    }
  } catch (err) {
    console.error("[admin/orders/confirm]", err);
    return NextResponse.json({ error: "Échec de la confirmation." }, { status: 500 });
  }
}