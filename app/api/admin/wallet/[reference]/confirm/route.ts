import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { completeWalletDeposit, failWalletDeposit } from "lib/wallet";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/wallet/[reference]/confirm — manual wallet deposit
 * reconciliation (admin only).
 *
 * Used when a Mobile Money operator isn't wired to a live webhook: the
 * administrator verifies the funds were received (e.g. by checking the
 * merchant Mobile Money account) and credits the buyer's balance here.
 * Only an authenticated admin can call this; the client never can.
 *
 * Body: { status: "completed" | "failed", transactionReference? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { reference } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;

  try {
    if (status === "completed") {
      const result = await completeWalletDeposit(reference, body.transactionReference ?? null);
      return NextResponse.json({
        ok: true,
        reference,
        alreadyCompleted: result.alreadyCompleted,
      });
    }
    if (status === "failed") {
      await failWalletDeposit(reference);
      return NextResponse.json({ ok: true, reference, status: "failed" });
    }
    return NextResponse.json(
      { error: "Statut invalide (completed, failed)." },
      { status: 400 },
    );
  } catch (err) {
    console.error("[admin/wallet/confirm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la confirmation." },
      { status: 500 },
    );
  }
}