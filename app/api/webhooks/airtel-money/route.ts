import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret } from "lib/webhookAuth";
import { handleMobileMoneyConfirmation } from "lib/mobile-money-confirm";

export const dynamic = "force-dynamic";

/** Real Airtel Money transaction callback, confirming a collection request.
 *  Signature-verified, deduplicated and audited (I6 amendments 4/8) before
 *  any side effect. */
export async function POST(req: NextRequest) {
  const auth = verifyWebhookSecret(req, "airtel");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const body = await req.json().catch(() => ({}));
  const reference = String(body.transaction?.id ?? body.reference ?? "");
  const status = String(body.transaction?.status ?? body.status ?? "").toUpperCase();

  if (!reference) return NextResponse.json({ error: "Référence manquante." }, { status: 400 });

  const AIRTEL_FAILURE = new Set([
    "TF", "FAILED", "CANCELLED", "REJECTED", "ERROR", "EXPIRED",
  ]);
  let statusKind: "success" | "failure" | "other" = "other";
  if (status === "TS" || status === "SUCCESS") statusKind = "success";
  else if (AIRTEL_FAILURE.has(status)) statusKind = "failure";

  const result = await handleMobileMoneyConfirmation({
    provider: "airtel-money",
    eventId: `airtel-money:${reference}:${status || "unknown"}`,
    reference,
    providerRef: body.transaction?.airtel_money_id ?? String(reference) ?? null,
    statusKind,
    payload: body,
  });
  return NextResponse.json(
    result.action ? { received: true, action: result.action } : { received: true },
    { status: result.status },
  );
}