import { NextResponse } from 'next/server';
import { and, asc, count, desc, eq, inArray, isNotNull, sql, sum } from 'drizzle-orm';
import { db } from 'db';
import { orders, photos, users, walletTransactions } from 'db/schema';
import { getSessionUser } from 'lib/auth';
import { adminDeleteUserSchema, adminOrderStatusSchema, adminUserRoleSchema } from 'lib/validation';
import { PLATFORM_COMMISSION_RATE, SALE_STATUSES } from 'lib/orders';

export const dynamic = 'force-dynamic';

// GET /api/admin - Admin overview
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();

    // Check if user is authenticated and is an admin
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get overview statistics
    const [
      totalUsers,
      totalPhotos,
      totalOrders,
      totalRevenue,
      walletTotals,
      recentUsers,
      recentOrders,
      refundPending,
      refundPendingReasons,
      oldestRefundPending,
      openDisputes,
      negativeBalances,
      negativePhotographers,
    ] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(photos),
      db.select({ value: count() }).from(orders),
      /* Revenue = only REALIZED sales: pending/cancelled are not sales yet,
         and refund_pending/refunded NEVER count (I6 amendment 11). */
      db
        .select({ value: sum(orders.total) })
        .from(orders)
        .where(inArray(orders.status, [...SALE_STATUSES])),
      db.select({
        type: walletTransactions.type,
        status: walletTransactions.status,
        value: sql<string>`coalesce(sum(${walletTransactions.amount})::float, 0)`,
      })
        .from(walletTransactions)
        .groupBy(walletTransactions.type, walletTransactions.status),
      db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        role: users.role,
      })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(5),
      db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        status: orders.status,
        createdAt: orders.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .orderBy(desc(orders.createdAt))
        .limit(5),
      /* I6 clôture — tâche 2 : compteurs d'exceptions financières. */
      db.select({ value: count() }).from(orders).where(eq(orders.status, "refund_pending")),
      db
        .select({ reason: orders.refundReason, value: count() })
        .from(orders)
        .where(eq(orders.status, "refund_pending"))
        .groupBy(orders.refundReason),
      db.select({
        orderNumber: orders.orderNumber,
        refundReason: orders.refundReason,
        total: orders.total,
        createdAt: orders.createdAt,
        userEmail: users.email,
      })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(eq(orders.status, "refund_pending"))
        .orderBy(asc(orders.createdAt))
        .limit(1),
      /* Litiges ouverts : disputed_at posé et vente encore payée (une commande
         refunded après litige perdu n'est plus un litige ouvert). */
      db
        .select({ value: count() })
        .from(orders)
        .where(and(isNotNull(orders.disputedAt), eq(orders.status, "paid"))),
      /* Soldes vendeurs négatifs : dette assumée par la plateforme (I6). */
      db
        .select({ value: count() })
        .from(users)
        .where(sql`${users.availableBalance}::numeric < 0`),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          availableBalance: users.availableBalance,
        })
        .from(users)
        .where(sql`${users.availableBalance}::numeric < 0`)
        .orderBy(sql`${users.availableBalance}::numeric asc`)
        .limit(10),
    ]);

    const grossRevenue = Number(totalRevenue[0].value ?? 0);
    const commission = Math.round(grossRevenue * PLATFORM_COMMISSION_RATE * 100) / 100;

    const walletByType: Record<string, { completed: number; pending: number; failed: number }> = {};
    for (const row of walletTotals) {
      const t = row.type;
      walletByType[t] ??= { completed: 0, pending: 0, failed: 0 };
      walletByType[t][row.status] = Number(row.value);
    }
    const volume = {
      deposits: walletByType.deposit?.completed ?? 0,
      purchases: walletByType.purchase?.completed ?? 0,
      payouts: walletByType.payout?.completed ?? 0,
    };

    const refundPendingReasonsMap: Record<string, number> = {};
    for (const row of refundPendingReasons) {
      refundPendingReasonsMap[row.reason ?? "inconnue"] = Number(row.value);
    }

    return NextResponse.json({
      stats: {
        users: totalUsers[0].value,
        photos: totalPhotos[0].value,
        orders: totalOrders[0].value,
        revenue: grossRevenue,
        commission,
        volume,
        refundPending: Number(refundPending[0].value),
        refundPendingReasons: refundPendingReasonsMap,
        oldestRefundPending: oldestRefundPending[0] ?? null,
        openDisputes: Number(openDisputes[0].value),
        negativeBalances: Number(negativeBalances[0].value),
        negativePhotographers: negativePhotographers,
      },
      recentUsers,
      recentOrders
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin - Admin management actions
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();

    // Check if user is authenticated and is an admin
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    switch (action) {
      case 'updateUserRole': {
        const parsed = adminUserRoleSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'User ID and role are required' },
            { status: 400 }
          );
        }

        const [updatedUser] = await db
          .update(users)
          .set({ role: parsed.data.role })
          .where(eq(users.id, parsed.data.userId))
          .returning();

        return NextResponse.json({ user: updatedUser });
      }

      case 'deleteUser': {
        const parsed = adminDeleteUserSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'User ID is required' },
            { status: 400 }
          );
        }

        await db.delete(users).where(eq(users.id, parsed.data.userId));

        return NextResponse.json({ success: true });
      }

      case 'updateOrderStatus': {
        const parsed = adminOrderStatusSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Order ID and status are required' },
            { status: 400 }
          );
        }

        const [updatedOrder] = await db
          .update(orders)
          .set({ status: parsed.data.status })
          .where(eq(orders.id, parsed.data.orderId))
          .returning();

        return NextResponse.json({ order: updatedOrder });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Admin management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
