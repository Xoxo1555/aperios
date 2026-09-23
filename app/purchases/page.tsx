import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "db";
import { orderItems, orders, photos } from "db/schema";
import { getSessionUser } from "lib/auth";
import PurchasesClient, { type PurchaseRow } from "./PurchasesClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "My HD purchases" };

export default async function PurchasesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/purchases");

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      total: orders.total,
      status: orders.status,
      itemId: orderItems.id,
      photoId: photos.id,
      title: photos.title,
      slug: photos.slug,
      imageUrl: photos.thumbUrl,
      licenseType: orderItems.licenseType,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(photos, eq(photos.id, orderItems.photoId))
    .where(
      and(
        eq(orders.userId, user.id),
        eq(orders.kind, "digital"),
        inArray(orders.status, ["completed", "paid"]),
      ),
    )
    .orderBy(desc(orders.createdAt));

  const items: PurchaseRow[] = rows.map((r) => ({
    orderNumber: r.orderNumber,
    createdAt: r.createdAt.toISOString(),
    total: r.total,
    status: r.status,
    itemId: r.itemId,
    photoId: r.photoId,
    title: r.title,
    slug: r.slug,
    imageUrl: r.imageUrl,
    licenseType: r.licenseType,
  }));

  return <PurchasesClient rows={items} />;
}