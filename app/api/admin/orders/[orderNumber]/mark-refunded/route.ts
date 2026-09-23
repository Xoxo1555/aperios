import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "lib/auth";
import { markOrderRefundedManual } from "lib/orders";
import { sendAdminAlert } from "lib/admin-alert";

export const dynamic = "force-dynamic";

const markRefundedSchema = z.object({
  operatorReference: z.string().min(3, "operatorReference requis (min 3 caractères)."),
  note: z.string().optional(),
});

/**
 * POST /api/admin/orders/[orderNumber]/mark-refunded — I6 clôture (tâche 1).
 *
 * Termine le remboursement MANUEL d'une commande Mobile Money. Une commande
 * Orange / MVola / Airtel passe en `refund_pending` quand la finalisation a
 * échoué (ou à la réception d'un succès tardif sur une commande annulée) :
 * les opérateurs n'ont pas d'API de remboursement branchée, la restitution est
 * un acte HUMAIN. Une fois celle-ci confirmée coté opérateur, ce point d'entrée
 * flippe la commande vers son état terminal `refunded`.
 *
 * La transition d'argent est 100 % dans `markOrderRefundedManual`
 * (lib/orders.ts) : flip GARDÉ (`WHERE status = 'refund_pending'`) sous les
 * verrous comptes partagés positionnés selon l'ordre global déterministe
 * (`lockOrderUsers`), donc idempotent et impossible à faire passer deux fois.
 * Aucune reprise au vendeur : une `refund_pending` n'a JAMAIS été créditée (le
 * crédit photographe n'existe qu'après le flip gardé pending→paid|completed de
 * la finalisation), et aucun certificat n'a été émis non plus. Aucun appel
 * Stripe : le mobile money n'emprunte jamais le chemin de remboursement Stripe.
 *
 * Gardes : admin (401 / 403) ; corps validé zod (operatorReference ≥ 3);
 * `unmatched` → 404 ; statut ≠ refund_pending → 409 NOT_REFUND_PENDING ;
 * paiement Stripe → 409 STRIPE_PAYMENT (passer par retry-refund, qui exécute
 * le vrai remboursement Stripe) ; déjà refunded → 200 already-refunded (no-op).
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

  const body = await req.json().catch(() => null);
  const parsed = markRefundedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Corps invalide : operatorReference (min 3 caractères) requis.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }
  const { operatorReference, note } = parsed.data;

  const outcome = await markOrderRefundedManual(orderNumber, operatorReference);

  switch (outcome.status) {
    case "unmatched":
      return NextResponse.json({ error: "Commande introuvable.", code: "ORDER_NOT_FOUND" }, { status: 404 });
    case "not-refund-pending":
      return NextResponse.json(
        { error: "mark-refunded uniquement pour une commande en refund_pending.", code: "NOT_REFUND_PENDING" },
        { status: 409 },
      );
    case "stripe-payment":
      return NextResponse.json(
        {
          error: "Paiement Stripe : utilisez POST retry-refund pour émettre le remboursement.",
          code: "STRIPE_PAYMENT",
        },
        { status: 409 },
      );
    case "already-refunded":
      return NextResponse.json({
        ok: true,
        status: "already-refunded",
        message: "Cette commande a déjà été remboursée.",
        refundId: outcome.refundId ?? null,
        order: outcome.order,
      });
    case "refunded":
      await sendAdminAlert({
        subject: `Remboursement MANUEL Mobile Money confirmé — ${orderNumber}`,
        body: [
          `Commande : ${orderNumber}`,
          `Référence opérateur : ${operatorReference}`,
          note ? `Note : ${note}` : null,
          `Admin : ${user.email}`,
          `Refund (DB) : manual:${operatorReference}`,
        ]
          .filter((l): l is string => Boolean(l))
          .join("\n"),
      });
      return NextResponse.json({
        ok: true,
        status: "refunded",
        refundId: outcome.refundId ?? null,
        order: outcome.order,
      });
  }
}