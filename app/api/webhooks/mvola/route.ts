import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret } from "lib/webhookAuth";
import { handleMobileMoneyConfirmation } from "lib/mobile-money-confirm";

export const dynamic = "force-dynamic";

/**
 * Real MVola (Yas) transaction callback. MVola posts here once the customer
 * confirms the merchant-pay request on their phone. Every callback is
 * signature-verified, deduplicated and audited (I6 amendments 4/8) before
 * any side effect.
 */
export async function POST(req: NextRequest) {
  const auth = verifyWebhookSecret(req, "mvola");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const body = await req.json().catch(() => ({}));
  const status = String(body.transactionStatus ?? body.status ?? "").toLowerCase();
  const reference =
    body?.metadata?.find?.((m: { key: string; value: string }) => m.key === "reference")?.value ??
    body.reference ??
    "";

  if (!reference) {
    return NextResponse.json({ error: "Référence de commande manquante." }, { status: 400 });
  }

  const MVOLA_FAILURE = new Set([
    "failed", "cancelled", "rejected", "error", "expired", "timeout", "declined",
  ]);
  let statusKind: "success" | "failure" | "other" = "other";
  if (status === "completed") statusKind = "success";
  else if (MVOLA_FAILURE.has(status)) statusKind = "failure";

  const result = await handleMobileMoneyConfirmation({
    provider: "mvola",
    eventId: `mvola:${reference}:${status || "unknown"}`,
    reference,
    providerRef: body.transactionReference ?? body.serverCorrelationId ?? null,
    statusKind,
    payload: body,
  });
  return NextResponse.json(
    result.action ? { received: true, action: result.action } : { received: true },
    { status: result.status },
  );
}