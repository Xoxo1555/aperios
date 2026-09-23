import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "db";
import { orderItems, orders, photos } from "db/schema";
import { getSessionUser } from "lib/auth";
import { formatDate } from "lib/utils";
import { formatInCurrency } from "lib/money";
import { getActiveCurrency } from "lib/server-currency";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mes achats HD" };

export default async function PurchasesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/purchases");

  const currency = await getActiveCurrency();
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      orderId: orders.id,
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

  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = grouped.get(r.orderNumber) ?? [];
    arr.push(r);
    grouped.set(r.orderNumber, arr);
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <div className="gallery-label">
        <BiIcon name="bi-download" className="me-1 text-gold" />HD
      </div>
      <h1 className="font-display font-bold mb-1">Mes achats HD</h1>
      <p className="text-muted-2 mb-4" style={{ fontSize: "0.95rem" }}>
        Téléchargez les fichiers originaux haute définition que vous avez achetés.
      </p>

      {grouped.size === 0 ? (
        <div className="text-center" style={{ background: "var(--ap-card)", border: "1px solid var(--ap-border)", borderRadius: 16, padding: "3rem 1rem", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-3" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BiIcon name="bi-bag" style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
          </span>
          <h2 className="font-display font-bold mb-1" style={{ fontSize: "1.25rem", color: "var(--ap-card-foreground)" }}>Aucun achat pour le moment</h2>
          <p className="text-muted-2 mb-4" style={{ maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>Parcourez la galerie pour acheter votre première photo HD.</p>
          <Link href="/photos" className="btn btn-gold">Parcourir la galerie</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {[...grouped.entries()].map(([orderNumber, items]) => (
            <div key={orderNumber} className="bg-surface rounded-2xl p-4 border" style={{ borderColor: "var(--ap-border)" }}>
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <div className="font-bold" style={{ fontSize: "0.95rem" }}>{orderNumber}</div>
                  <div className="text-muted-2" style={{ fontSize: "0.78rem" }}>
                    {formatDate(items[0].createdAt.toISOString())} · {formatInCurrency(parseFloat(items[0].total), currency)}
                  </div>
                </div>
                <span className="badge rounded-pill" style={{ fontSize: "0.7rem", background: "rgba(125,189,140,0.15)", color: "var(--ap-green)", border: "1px solid rgba(125,189,140,0.4)" }}>
                  <BiIcon name="bi-check-circle" className="me-1" />
                  {items[0].status === "completed" ? "Terminée" : "Payée"}
                </span>
              </div>

              <div className="grid gap-2">
                {items.map((item) => (
                  <div key={item.itemId} className="flex items-center gap-3 bg-surface-2 rounded-lg p-2" style={{ border: "1px solid var(--ap-border)" }}>
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.title} width={56} height={56} className="object-cover" unoptimized={process.env.NODE_ENV === "development"} style={{ borderRadius: 6 }} />
                    ) : (
                      <span className="inline-flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 6, background: "var(--ap-surface)" }}>
                        <BiIcon name="bi-image" className="text-muted-2" />
                      </span>
                    )}
                    <div className="grow">
                      <Link href={`/photo/${item.slug}`} className="fw-semibold" style={{ fontSize: "0.85rem" }}>{item.title}</Link>
                      <div className="text-muted-2" style={{ fontSize: "0.72rem" }}>
                        {item.licenseType === "commercial" ? "Licence commerciale" : "Licence personnelle"}
                      </div>
                    </div>
                    <a className="btn btn-gold btn-sm" href={`/api/photos/${item.photoId}/file`} download>
                      <BiIcon name="bi-download" className="me-1" />Télécharger HD
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}