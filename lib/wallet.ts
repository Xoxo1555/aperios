import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomInt } from "crypto";
import { db } from "db";
import { users, walletDepositIntents, walletTransactions } from "db/schema";

/**
 * Aperio wallet ledger — deposits, withdrawals and purchases unified in a
 * single `wallet_transactions` table, in canonical EUR.
 *
 *  - A deposit is first recorded as a PENDING `wallet_deposit_intent`, not as
 *    a `wallet_transactions` row. The ledger row is only inserted — already
 *    `completed` — once the payment is genuinely confirmed (Stripe webhook,
 *    Mobile Money callback, or admin reconciliation). The initiating request
 *    never credits anything.
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

export interface WalletDepositIntentInput {
  userId: number;
  amount: number;
  paymentMethod: WalletPaymentMethod;
}

/** Records a PENDING deposit intent. NOTHING is written to the ledger yet:
 *  the `wallet_transactions` row is only inserted once the payment is
 *  genuinely confirmed (see completeWalletDeposit). */
export async function createWalletDepositIntent(
  input: WalletDepositIntentInput,
): Promise<typeof walletDepositIntents.$inferSelect> {
  const [intent] = await db
    .insert(walletDepositIntents)
    .values({
      userId: input.userId,
      reference: generateWalletReference(),
      amount: String(input.amount),
      paymentMethod: input.paymentMethod,
      status: "pending",
    })
    .returning();
  return intent;
}

/** Stores the provider reference (Stripe session, MVola correlation id…) on a
 *  pending deposit intent so the callback can be matched back. */
export async function setWalletDepositIntentProviderRef(
  reference: string,
  providerRef: string | null,
): Promise<void> {
  await db
    .update(walletDepositIntents)
    .set({ transactionReference: providerRef, updatedAt: new Date() })
    .where(eq(walletDepositIntents.reference, reference));
}

/** Finds a completed/legacy deposit ledger row for a reference. */
async function findWalletDeposit(
  reference: string,
): Promise<typeof walletTransactions.$inferSelect | null> {
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
  return tx ?? null;
}

/** Resolves the trusted amount (in EUR) of a deposit from its intent, or from
 *  a legacy pending ledger row. Returns null when neither exists. */
export async function getWalletDepositAmount(
  reference: string,
): Promise<number | null> {
  const [intent] = await db
    .select({ amount: walletDepositIntents.amount })
    .from(walletDepositIntents)
    .where(eq(walletDepositIntents.reference, reference))
    .limit(1);
  if (intent) return parseFloat(intent.amount);

  const legacy = await findWalletDeposit(reference);
  return legacy ? parseFloat(legacy.amount) : null;
}

/** Marks a pending deposit (intent, or legacy ledger row) as failed — e.g.
 *  the payment session could not be created, an operator rejected it, or an
 *  admin rejects a manual deposit. No balance is ever touched. */
export async function failWalletDeposit(
  reference: string,
): Promise<boolean> {
  const intentRes = await db
    .update(walletDepositIntents)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(walletDepositIntents.reference, reference),
        eq(walletDepositIntents.status, "pending"),
      ),
    );
  if ((intentRes.rowCount ?? 0) > 0) return true;

  const legacyRes = await db
    .update(walletTransactions)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(walletTransactions.reference, reference),
        eq(walletTransactions.type, "deposit"),
        eq(walletTransactions.status, "pending"),
      ),
    );
  return (legacyRes.rowCount ?? 0) > 0;
}

/**
 * Confirms a pending deposit: INSERTS the `completed` ledger row and credits
 * the user's available balance in a single database transaction.
 *
 * Works from the deposit intent (normal path) or, for deposits created before
 * the intents split, from an existing PENDING ledger row (legacy path).
 *
 * Idempotent: a webhook replay can never double-credit — the intent's guarded
 * `pending → completed` flip means only one caller inserts the ledger row and
 * increments the balance; concurrent replays report `alreadyCompleted`.
 */
export async function completeWalletDeposit(
  reference: string,
  transactionReference?: string | null,
): Promise<{
  tx: typeof walletTransactions.$inferSelect;
  alreadyCompleted: boolean;
}> {
  const [intent] = await db
    .select()
    .from(walletDepositIntents)
    .where(eq(walletDepositIntents.reference, reference))
    .limit(1);

  if (intent) {
    if (intent.status === "failed") {
      throw new Error(`Ce dépôt (${reference}) a été annulé.`);
    }

    const amount = parseFloat(intent.amount);
    const providerRef = transactionReference ?? intent.transactionReference;

    try {
      const created = await db.transaction(async (txn) => {
        /* Guarded flip: only the first confirmation wins the pending →
         * completed transition; a concurrent replay sees 0 rows and skips
         * both the insert and the balance credit. */
        const flip = await txn
          .update(walletDepositIntents)
          .set({
            status: "completed",
            transactionReference: providerRef,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(walletDepositIntents.id, intent.id),
              eq(walletDepositIntents.status, "pending"),
            ),
          );
        if ((flip.rowCount ?? 0) === 0) return null;

        const [row] = await txn
          .insert(walletTransactions)
          .values({
            userId: intent.userId,
            reference: intent.reference,
            amount: intent.amount,
            type: "deposit",
            status: "completed",
            paymentMethod: intent.paymentMethod,
            transactionReference: providerRef,
          })
          .returning();

        await txn.execute(sql`
          UPDATE users SET available_balance =
            (available_balance::numeric + ${amount}::numeric)
          WHERE id = ${intent.userId}
        `);
        return row;
      });

      if (created) return { tx: created, alreadyCompleted: false };

      /* Lost the race to a concurrent confirmation — report it as done. */
      const existing = await findWalletDeposit(reference);
      if (existing) return { tx: existing, alreadyCompleted: true };
      throw new Error(`Dépôt ${reference} déjà traité.`);
    } catch (err) {
      /* Unique-violation on the ledger reference means a concurrent caller
       * already inserted the completed row — idempotent success, not error. */
      if ((err as { code?: string })?.code === "23505") {
        const existing = await findWalletDeposit(reference);
        if (existing) return { tx: existing, alreadyCompleted: true };
      }
      throw err;
    }
  }

  /* Legacy fallback: deposits created before the intents split already have a
   * PENDING ledger row that must be completed in place. */
  const legacy = await findWalletDeposit(reference);
  if (!legacy) throw new Error(`Dépôt introuvable: ${reference}`);
  if (legacy.status === "completed") return { tx: legacy, alreadyCompleted: true };
  if (legacy.status === "failed") {
    throw new Error(`Ce dépôt (${reference}) a été annulé.`);
  }

  const amount = parseFloat(legacy.amount);
  const providerRef = transactionReference ?? legacy.transactionReference;

  const credited = await db.transaction(async (txn) => {
    /* Guarded flip: only credit when this call actually took the row out of
     * `pending` (a concurrent confirmation would leave it at 0 rows). */
    const flip = await txn
      .update(walletTransactions)
      .set({
        status: "completed",
        transactionReference: providerRef,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletTransactions.id, legacy.id),
          eq(walletTransactions.status, "pending"),
        ),
      );
    if ((flip.rowCount ?? 0) === 0) return false;

    await txn.execute(sql`
      UPDATE users SET available_balance =
        (available_balance::numeric + ${amount}::numeric)
      WHERE id = ${legacy.userId}
    `);
    return true;
  });

  if (!credited) {
    const existing = await findWalletDeposit(reference);
    if (existing) return { tx: existing, alreadyCompleted: true };
  }
  return { tx: { ...legacy, status: "completed" as const }, alreadyCompleted: false };
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
    .where(
      and(
        eq(walletTransactions.userId, userId),
        sql`${walletTransactions.status} != 'pending'`,
      ),
    )
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