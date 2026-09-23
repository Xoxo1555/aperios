import { NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { getWalletBalance, getWalletTransactions } from "lib/wallet";
import type { WalletTransactionDto } from "lib/types";

export const dynamic = "force-dynamic";

/** GET /api/wallet — current available balance + recent wallet ledger rows. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [balance, txs] = await Promise.all([
    getWalletBalance(user.id),
    getWalletTransactions(user.id, 50),
  ]);

  return NextResponse.json({
    balance,
    transactions: txs.map(
      (tx): WalletTransactionDto => ({
        id: tx.id,
        reference: tx.reference,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        paymentMethod: tx.paymentMethod,
        transactionReference: tx.transactionReference,
        createdAt: tx.createdAt.toISOString(),
      }),
    ),
  });
}