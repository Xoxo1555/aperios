import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "db";
import { payouts, users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { disbursePayout } from "lib/payouts";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payouts/[reference]/retry — manual retry (relance) of a
 * previously failed automatic payout. Admin only. Re-reserves the balance and
 * calls the operator again; on success marks `completed`, on failure keeps it
 * `failed` (balance already refunded).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { reference } = await params;

  const [payout] = await db
    .select({
      id: payouts.id,
      userId: payouts.userId,
      reference: payouts.reference,
      amount: payouts.amount,
      method: payouts.method,
      account: payouts.account,
      status: payouts.status,
    })
    .from(payouts)
    .where(eq(payouts.reference, reference))
    .limit(1);

  if (!payout) return NextResponse.json({ error: "Retrait introuvable." }, { status: 404 });
  if (payout.status !== "failed") {
    return NextResponse.json({ error: "Seul un retrait échoué peut être relancé." }, { status: 400 });
  }

  const amount = parseFloat(payout.amount);

  /* Re-reserve the balance for this retry. */
  const [cur] = await db.select({ balance: users.availableBalance }).from(users).where(eq(users.id, payout.userId)).limit(1);
  const balance = parseFloat(cur?.balance ?? "0");
  if (balance < amount) {
    return NextResponse.json(
      { error: `Solde insuffisant pour relancer (${balance.toFixed(2)} € disponibles).` },
      { status: 400 },
    );
  }
  await db
    .update(users)
    .set({ availableBalance: sql`(${users.availableBalance}::numeric - ${amount}::numeric)` })
    .where(eq(users.id, payout.userId));

  const result = await disbursePayout({
    method: payout.method as never,
    amountEur: amount,
    account: payout.account,
    reference,
  });

  if (result.ok) {
    await db
      .update(payouts)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(payouts.reference, reference));
    return NextResponse.json({ ok: true, status: "completed", providerRef: result.providerRef });
  }

  /* Retry failed again: refund the reserved balance. */
  await db
    .update(users)
    .set({ availableBalance: sql`(${users.availableBalance}::numeric + ${amount}::numeric)` })
    .where(eq(users.id, payout.userId));

  return NextResponse.json({ ok: false, status: "failed", error: result.reason }, { status: 422 });
}
