import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomInt } from "crypto";
import { db } from "db";
import { users, walletTransactions } from "db/schema";

/**
 * Aperio wallet ledger — deposits, withdrawals and purchases unified in a
 * single `wallet_transactions` table, in canonical EUR.
 *
 *  - Deposits are created PENDING and are only credited to the balance once
 *    the payment is genuinely confirmed (Stripe webhook, Mobile Money
 *    callback, or admin reconciliation) — never by the initiating request.
 *  - Payouts and purchases are recorded for history; their balance effect is
 *    handled by the existing payout / order flows.
 */

export const WALLET_DEPOSIT_MIN = 5;
export const WALLET_DEPOSIT_MAX = 1000;
export const WALLET_REF_PREFIX = "WLD";

export type WalletPaymentMethod =
  | "stripe"
  | "orange_money"
  | "mvola"
  | "airtel_money";

export type WalletTxType = "deposit" | "payout" | "purchase" | "clawback";
export type WalletTxStatus = "pending" | "completed" | "failed";

/** Mobile Money / provider method names as used by payouts & orders. */
const PAYMENT_METHOD_ALIASES: Record<string, WalletPaymentMethod> = {
  "orange-money": "orange_money",
  orange_money: "orange_money",
  mvola: "mvola",
  "airtel-money": "airtel_money",
  airtel_money: "airtel_money",
  stripe: "stripe",
  card: "stripe",
};

export function isWalletReference(ref: string): boolean {
  return ref.startsWith(`${WALLET_REF_PREFIX}-`);
}

export function normalizeWalletPaymentMethod(
  method: string,
): WalletPaymentMethod {
  return PAYMENT_METHOD_ALIASES[method] ?? "stripe";
}

export function generateWalletReference(): string {
  return `${WALLET_REF_PREFIX}-${new Date().getFullYear()}-${randomInt(100000, 999999)}`;
}

export interface WalletDepositCreateInput {
  userId: number;
  amount: number;
  paymentMethod: WalletPaymentMethod;
  transactionReference?: string | null;
}

/** Creates a PENDING deposit ledger row. The balance is credited only once
 *  the payment is confirmed (see completeWalletDeposit). */
export async function createWalletDepositTx(
  input: WalletDepositCreateInput,
): Promise<typeof walletTransactions.$inferSelect> {
  const [tx] = await db
    .insert(walletTransactions)
    .values({
      userId: input.userId,
      reference: generateWalletReference(),
      amount: String(input.amount),
      type: "deposit",
      status: "pending",
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference ?? null,
    })
    .returning();
  return tx;
}

/** Marks a pending deposit as failed (e.g. payment session could not be
 *  created, or admin rejects a manual deposit). No balance is touched. */
export async function failWalletDeposit(
  reference: string,
): Promise<boolean> {
  const res = await db
    .update(walletTransactions)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(walletTransactions.reference, reference),
        eq(walletTransactions.status, "pending"),
      ),
    );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Confirms a pending deposit and credits the user's available balance.
 *
 * Idempotent: already-completed deposits are a no-op (a webhook replay can
 * never double-credit). The status flip and the balance increment happen in
 * a single database transaction.
 */
export async function completeWalletDeposit(
  reference: string,
  transactionReference?: string | null,
): Promise<{
  tx: typeof walletTransactions.$inferSelect;
  alreadyCompleted: boolean;
}> {
  const [tx] = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.reference, reference),
        eq(walletTransactions.type, "deposit"),
      ),
    )
    .limit(1);

  if (!tx) throw new Error(`Dépôt introuvable: ${reference}`);
  if (tx.status === "completed") return { tx, alreadyCompleted: true };
  if (tx.status === "failed") {
    throw new Error(`Ce dépôt (${reference}) a été annulé.`);
  }

  const amount = parseFloat(tx.amount);
  const providerRef = transactionReference ?? tx.transactionReference;

  await db.transaction(async (txn) => {
    await txn
      .update(walletTransactions)
      .set({
        status: "completed",
        transactionReference: providerRef,
        updatedAt: new Date(),
      })
      .where(eq(walletTransactions.id, tx.id));

    await txn.execute(sql`
      UPDATE users SET available_balance =
        (available_balance::numeric + ${amount}::numeric)
      WHERE id = ${tx.userId}
    `);
  });

  return { tx: { ...tx, status: "completed" as const }, alreadyCompleted: false };
}

/**
 * Best-effort ledger entry used by the payout / order flows so deposits,
 * withdrawals and purchases all appear in the wallet history. Never throws:
 * a failure to record history must not break a payment operation.
 */
export async function recordWalletLedger(
  opts: {
    userId: number;
    reference: string;
    amount: number;
    type: WalletTxType;
    status: WalletTxStatus;
    paymentMethod: string;
    transactionReference?: string | null;
  },
): Promise<void> {
  try {
    await db.insert(walletTransactions).values({
      userId: opts.userId,
      reference: opts.reference,
      amount: String(Math.round(opts.amount * 100) / 100),
      type: opts.type,
      status: opts.status,
      paymentMethod: normalizeWalletPaymentMethod(opts.paymentMethod),
      transactionReference: opts.transactionReference ?? null,
    });
  } catch (err) {
    console.error("[wallet] record ledger failed", err);
  }
}

/** Syncs a wallet ledger row with the final status of its payout. */
export async function syncPayoutLedger(
  reference: string,
  status: "pending" | "processing" | "completed" | "failed",
): Promise<void> {
  /* The wallet ledger only tracks pending / completed / failed: a payout in
   * "processing" still shows as pending there. */
  const ledgerStatus: WalletTxStatus = status === "processing" ? "pending" : status;
  try {
    await db
      .update(walletTransactions)
      .set({ status: ledgerStatus, updatedAt: new Date() })
      .where(
        and(
          eq(walletTransactions.reference, reference),
          eq(walletTransactions.type, "payout"),
        ),
      );
  } catch (err) {
    console.error("[wallet] sync payout ledger failed", err);
  }
}

export async function getWalletTransactions(
  userId: number,
  limit = 50,
): Promise<typeof walletTransactions.$inferSelect[]> {
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);
}

export async function getWalletBalance(userId: number): Promise<string> {
  const [row] = await db
    .select({ balance: users.availableBalance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.balance ?? "0";
}