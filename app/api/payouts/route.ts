import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { payoutRequestSchema } from "lib/validation";
import { recordWalletLedger, syncPayoutLedger } from "lib/wallet";
import { disbursePayout } from "lib/payouts";

export const dynamic = "force-dynamic";

/**
 * POST /api/payouts — request a withdrawal of the photographer's available
 * balance. The balance is reserved immediately. In real-time the chosen
 * operator's disbursement API is called:
 *  - Success → payout is marked `completed` immediately.
 *  - Failure (missing credentials / operator refusal) → payout is marked
 *    `failed`, the reserved balance is refunded, and the error is logged.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "photographer" && user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux créateurs-artiste." }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = payoutRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }
  const { amount, method, account, accountName } = parsed.data;

  if (amount < 10) {
    return NextResponse.json({ error: "Montant minimum : 10 €." }, { status: 400 });
  }

  const reference = `PAY-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;

  // Réservation atomique : UPDATE gardé + INSERT dans une même transaction.
  // Le `WHERE available_balance::numeric >= amount` garantit qu'aucune
  // requête concurrente ne peut faire passer le solde en négatif (overspend).
  try {
    await db.transaction(async (tx) => {
      const [reserved] = await tx
        .update(users)
        .set({
          availableBalance: sql`(${users.availableBalance}::numeric - ${amount}::numeric)`,
        })
        .where(and(eq(users.id, user.id), gte(sql`available_balance::numeric`, sql`${amount}::numeric`)))
        .returning({ id: users.id });

      if (!reserved) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      await tx.execute(sql`
        INSERT INTO payouts (user_id, reference, amount, method, account, account_name, status)
        VALUES (${user.id}, ${reference}, ${amount}::numeric, ${method}, ${account}, ${accountName}, 'pending')
      `);
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_FUNDS") {
      const [current] = await db.select({ availableBalance: users.availableBalance }).from(users).where(eq(users.id, user.id)).limit(1);
      const balance = parseFloat(current?.availableBalance ?? "0");
      return NextResponse.json(
        { error: `Solde disponible insuffisant (${balance.toFixed(2)} €).` },
        { status: 400 },
      );
    }
    console.error("[payouts] reservation failed", err);
    return NextResponse.json({ error: "Impossible de réserver le retrait." }, { status: 500 });
  }

  await recordWalletLedger({
    userId: user.id,
    reference,
    amount,
    type: "payout",
    status: "pending",
    paymentMethod: method,
    transactionReference: req.nextUrl.origin,
  });

  /* ---------------------------------------------------------------
   * Real-time operator disbursement.
   * On success → mark `completed`.
   * On failure → mark `failed` and refund the reserved balance.
   * --------------------------------------------------------------- */
  const result = await disbursePayout({ method, amountEur: amount, account, reference });

  if (result.ok) {
    await db.execute(sql`
      UPDATE payouts SET status = 'completed', processed_at = now()
      WHERE reference = ${reference}
    `);
    await syncPayoutLedger(reference, "completed");

    return NextResponse.json({
      ok: true,
      payout: { reference, amount, method, account, accountName, status: "completed", providerRef: result.providerRef },
      message: "Votre retrait a été traité avec succès.",
    }, { status: 201 });
  }

  /* Payout failed: refund the reserved balance */
  await db.execute(sql`
    UPDATE payouts SET status = 'failed', processed_at = now()
    WHERE reference = ${reference}
  `);
  await syncPayoutLedger(reference, "failed");
  await db
    .update(users)
    .set({ availableBalance: sql`(${users.availableBalance}::numeric + ${amount}::numeric)` })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    ok: false,
    payout: { reference, amount, method, account, accountName, status: "failed" },
    error: result.reason,
    message: "Le retrait automatique a échoué. Votre solde a été remboursé.",
  }, { status: 422 });
}

/** List payouts for the current user */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = await db.execute(sql`
    SELECT id, reference, amount::text AS amount, method, account, account_name, status, processed_at, created_at
    FROM payouts WHERE user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 50
  `);
  return NextResponse.json({ payouts: rows as any });
}
