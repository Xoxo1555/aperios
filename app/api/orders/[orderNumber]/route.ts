import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "db";
import { photos } from "db/schema";
import { getSessionUser } from "@/lib/auth";
import { getOrderWithCertificates } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** Lets the buyer (or an admin) poll an order's real payment status. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const { orderNumber } = await params;
  const data = await getOrderWithCertificates(orderNumber);
  if (!data) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  if (data.order.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const photoRows = data.items.length
    ? await db
        .select({ id: photos.id, title: photos.title, slug: photos.slug, thumbUrl: photos.thumbUrl, imageUrl: photos.imageUrl, licenseType: photos.licenseType })
        .from(photos)
        .where(inArray(photos.id, data.items.map((i) => i.photoId)))
    : [];

  return NextResponse.json({
    order: {
      orderNumber: data.order.orderNumber,
      status: data.order.status,
      kind: data.order.kind,
      total: data.order.total,
      currency: data.order.currency,
      paymentProvider: data.order.paymentProvider,
    },
    items: data.items.map((i) => {
      const photo = photoRows.find((p) => p.id === i.photoId);
      return {
        id: i.photoId,
        title: photo?.title ?? null,
        slug: photo?.slug ?? null,
        imageUrl: photo?.thumbUrl ?? photo?.imageUrl ?? null,
        licenseType: i.licenseType ?? "personal",
      };
    }),
    certificates: data.certificates.map((c) => ({ serialNumber: c.serialNumber, watermarkHash: c.watermarkHash })),
  });
}
