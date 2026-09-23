import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret } from "lib/webhookAuth";
import { handleMobileMoneyConfirmation } from "lib/mobile-money-confirm";

export const dynamic = "force-dynamic";

/**
 * Real Orange Money notification callback (`notif_url`). Orange posts the
 * final transaction status here once the customer confirms the payment on
 * their phone. Every callback is signature-verified, deduplicated and audited
 * (I6 amendments 4/8) before any side effect.
 */
export async function POST(req: NextRequest) {
  const auth = verifyWebhookSecret(req, "orange");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const body = await req.json().catch(() => ({}));
  const orderNumber = String(body.order_id ?? body.orderId ?? "");
  const status = String(body.status ?? body.txnstatus ?? "").toUpperCase();

  if (!orderNumber) {
    return NextResponse.json({ error: "order_id manquant." }, { status: 400 });
  }

  const ORANGE_FAILURE = new Set([
    "FAILED", "CANCELLED", "CANCELLED_BY_USER", "REJECTED", "ERROR", "EXPIRED", "TIMEOUT", "DECLINED",
  ]);
  let statusKind: "success" | "failure" | "other" = "other";
  if (status === "SUCCESS" || status === "SUCCESSFUL") statusKind = "success";
  else if (ORANGE_FAILURE.has(status)) statusKind = "failure";

  const result = await handleMobileMoneyConfirmation({
    provider: "orange-money",
    eventId: `orange-money:${orderNumber}:${status || "unknown"}`,
    reference: orderNumber,
    providerRef: body.txnid ?? body.pay_token ?? null,
    statusKind,
    payload: body,
  });
  return NextResponse.json(
    result.action ? { received: true, action: result.action } : { received: true },
    { status: result.status },
  );
}