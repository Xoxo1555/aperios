import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "db";
import { users, walletTransactions } from "db/schema";
import { getSessionUser } from "lib/auth";

export const dynamic = "force-dynamic";

type Status = (typeof walletTransactions)["status"]["enumValues"][number];
type Type = (typeof walletTransactions)["type"]["enumValues"][number];

/** GET /api/admin/transactions — audit log of wallet ledger movements
 *  (deposits, purchases, payouts) with optional type/status filter. Used by
 *  the admin dashboard for the real-time transaction history and the
 *  failed-exception management view (`?status=failed`). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30") || 30));
  const status = searchParams.get("status") as Status | null;
  const type = searchParams.get("type") as Type | null;

  const where: SQL[] = [];
  if (status) where.push(eq(walletTransactions.status, status));
  if (type) where.push(eq(walletTransactions.type, type));

  const rows = await db
    .select({
      id: walletTransactions.id,
      reference: walletTransactions.reference,
      amount: walletTransactions.amount,
      type: walletTransactions.type,
      status: walletTransactions.status,
      paymentMethod: walletTransactions.paymentMethod,
      transactionReference: walletTransactions.transactionReference,
      createdAt: walletTransactions.createdAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(walletTransactions)
    .leftJoin(users, eq(walletTransactions.userId, users.id))
    .where(and(...where))
    .orderBy(desc(walletTransactions.createdAt))
    .offset((page - 1) * limit)
    .limit(limit);

  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTransactions)
    .where(and(...where));

  /* Totals per type (canonical EUR text). */
  const totals = await db
    .select({
      type: walletTransactions.type,
      value: sql<string>`coalesce(sum(amount)::float, 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        ...(status ? [eq(walletTransactions.status, status)] : []),
      ),
    )
    .groupBy(walletTransactions.type);

  return NextResponse.json({
    transactions: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      amount: r.amount,
      type: r.type,
      status: r.status,
      paymentMethod: r.paymentMethod,
      transactionReference: r.transactionReference,
      createdAt: r.createdAt.toISOString(),
      userName: r.userName ?? "—",
      userEmail: r.userEmail ?? "—",
    })),
    total: Number(totalCount),
    page,
    limit,
    pages: Math.ceil(Number(totalCount) / limit),
    totals: Object.fromEntries(totals.map((t) => [t.type, Number(t.value)])),
  });
}
