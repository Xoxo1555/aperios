import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "db";
import { mounts, orderItems, orders, photos, printsConfig, users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { fetchPhotoDtos } from "lib/queries";
import { formatPrice } from "lib/utils";
import { PLATFORM_COMMISSION_RATE, SALE_STATUSES } from "lib/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "photographer" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [stats] = await db
    .select({
      photoCount: sql<number>`count(*)::int`,
      downloads: sql<number>`coalesce(sum(${photos.downloads}), 0)::int`,
      likes: sql<number>`coalesce(sum(${photos.likesCount}), 0)::int`,
      views: sql<number>`coalesce(sum(${photos.views}), 0)::int`,
    })
    .from(photos)
    .where(eq(photos.photographerId, user.id));

  /* Revenue = only REALIZED sales: pending/cancelled are not sales yet, and
   * refund_pending/refunded NEVER count as revenue (I6 amendment 11). */
  const [revenueRow] = await db
    .select({
      revenue: sql<string>`coalesce(sum(coalesce(${orderItems.photographerShare}, round(${orderItems.lineTotal} * ${sql.raw(String(1 - PLATFORM_COMMISSION_RATE))}, 2))), 0)`,
      gross: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(photos, eq(orderItems.photoId, photos.id))
    .where(and(eq(photos.photographerId, user.id), inArray(orders.status, [...SALE_STATUSES])));

  const revenue = parseFloat(revenueRow?.revenue ?? "0");
  const gross = parseFloat(revenueRow?.gross ?? "0");

  const [balanceRow] = await db
    .select({ balance: users.availableBalance })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const availableBalance = parseFloat(balanceRow?.balance ?? "0");

  const recentOrders = await db
    .select({
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      status: orders.status,
      total: orders.total,
      lineTotal: orderItems.lineTotal,
      qty: orderItems.quantity,
      title: photos.title,
      slug: photos.slug,
      editionNumber: orderItems.editionNumber,
      sizeLabel: printsConfig.label,
      mountName: mounts.name,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(photos, eq(orderItems.photoId, photos.id))
    .leftJoin(printsConfig, eq(orderItems.printConfigId, printsConfig.id))
    .leftJoin(mounts, eq(orderItems.mountId, mounts.id))
    .where(eq(photos.photographerId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(8);

  const myPhotos = await fetchPhotoDtos({ photographerId: user.id, limit: 100 });

  return NextResponse.json({
    stats: {
      photoCount: stats?.photoCount ?? 0,
      downloads: stats?.downloads ?? 0,
      likes: stats?.likes ?? 0,
      views: stats?.views ?? 0,
      revenue,
      revenueLabel: formatPrice(revenue),
      grossSales: formatPrice(gross),
      commission: formatPrice(gross - revenue),
      availableBalance,
      availableBalanceLabel: formatPrice(availableBalance),
    },
    recentOrders: recentOrders.map((r) => ({
      orderNumber: r.orderNumber,
      date: r.createdAt,
      status: r.status,
      total: formatPrice(parseFloat(r.total)),
      item: r.title,
      slug: r.slug,
      edition: r.editionNumber,
      qty: r.qty,
      size: r.sizeLabel,
      mount: r.mountName,
    })),
    myPhotos: myPhotos.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      imageUrl: p.imageUrl,
      licenseType: p.licenseType,
      downloads: p.downloads,
      likes: p.likesCount,
      views: p.views,
      price: p.basePrice,
      available: p.availableStock,
      total: p.totalEditions,
    })),
  });
}
