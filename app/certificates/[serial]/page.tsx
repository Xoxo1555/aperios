import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates,
  mounts,
  orderItems,
  orders,
  photos,
  printsConfig,
  users,
} from "@/db/schema";
import PrintButton from "@/components/PrintButton";
import CertificatePdfButton from "@/components/CertificatePdfButton";
import { formatDate, blurDataUrl } from "@/lib/utils";
import { formatInCurrency } from "@/lib/money";
import { getActiveCurrency } from "@/lib/server-currency";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serial: string }>;
}): Promise<Metadata> {
  const { serial } = await params;
  const [meta] = await db
    .select({ revoked: certificates.revokedAt })
    .from(certificates)
    .where(eq(certificates.serialNumber, serial))
    .limit(1);
  return {
    title: `Certificate of Authenticity · ${serial}${meta?.revoked ? " · révoqué" : ""}`,
  };
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const currency = await getActiveCurrency();
  const rows = await db
    .select({
      cert: certificates,
      item: orderItems,
      photo: photos,
      photographer: users,
      order: orders,
      size: printsConfig,
      mount: mounts,
    })
    .from(certificates)
    .innerJoin(orderItems, eq(certificates.orderItemId, orderItems.id))
    .innerJoin(photos, eq(certificates.photoId, photos.id))
    .innerJoin(users, eq(photos.photographerId, users.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(printsConfig, eq(orderItems.printConfigId, printsConfig.id))
    .leftJoin(mounts, eq(orderItems.mountId, mounts.id))
    .where(eq(certificates.serialNumber, serial))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const cert = row.cert;
  const revokedAt = cert.revokedAt;
  const revoked = revokedAt !== null;
  const totalEditions = row.photo.totalEditions ?? row.item.editionNumber ?? 0;
  const verifyUrl = `https://aperio.gallery/certificates/${cert.serialNumber}`;

  return (
    <div className="container py-4">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h1 className="font-display font-bold mb-0">Certificate of authenticity</h1>
          <p className="text-muted-2 mb-0">
            Verified provenance for Aperio limited edition prints
          </p>
        </div>
        <div className="flex gap-2">
          {revoked ? (
            <span className="badge rounded-pill" style={{ background: "#b02a37", color: "#fff", fontSize: "0.72rem", letterSpacing: "0.08em" }}>
              RÉVOQUÉ
            </span>
          ) : (
            <>
              <CertificatePdfButton
                serial={cert.serialNumber}
                title={row.photo.title}
                artist={row.photographer.name}
                edition={`Print ${row.item.editionNumber} of ${totalEditions}`}
                size={row.size ? `${row.size.widthCm} × ${row.size.heightCm} cm` : "—"}
                mount={row.mount?.name ?? "Art Print"}
                price={formatInCurrency(parseFloat(row.item.lineTotal), currency)}
                orderNumber={row.order.orderNumber}
                hash={cert.watermarkHash}
                imageUrl={row.photo.thumbUrl ?? row.photo.imageUrl}
              />
              <PrintButton />
            </>
          )}
        </div>
      </div>

      <div className="cert-sheet rounded-2xl">
        <div className="watermark font-display">APERIO</div>
        <div className="cert-border">
          {revokedAt && (
            <div className="mb-3 p-3 text-center rounded-2xl" style={{ background: "#fbe9e7", border: "1px solid #b02a37" }}>
              <div className="font-display font-bold" style={{ color: "#b02a37", fontSize: "1.05rem", letterSpacing: "0.1em" }}>
                CE CERTIFICAT EST RÉVOQUÉ
              </div>
              <div className="mb-0 mt-1" style={{ fontSize: "0.78rem", color: "#8a2f3a" }}>
                This certificate is no longer valid ({formatDate(revokedAt)}). The
                corresponding order was refunded or disputed.
              </div>
            </div>
          )}
          <div className="text-center mb-4">
            <div className="font-display font-bold" style={{ fontSize: "1.5rem", letterSpacing: "0.08em" }}>
              APERIO<span style={{ color: "#b79a4b" }}>.</span> FINE ART
            </div>
            <div className="uppercase" style={{ fontSize: "0.72rem", letterSpacing: "0.3em", color: "#8a7a4d" }}>
              Certificate of authenticity
            </div>
          </div>

          <div className="row g-4 items-center">
            <div className="col-sm-5">
              <div className="relative" style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #ddd5c3" }}>
                <Image
                  src={row.photo.imageUrl}
                  alt={row.photo.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
                  className="object-cover"
                  unoptimized={process.env.NODE_ENV === "development"}
                  priority
                  placeholder="blur"
                  blurDataURL={blurDataUrl(row.photo.color)}
                />
              </div>
            </div>
            <div className="col-sm-7">
              <div className="font-bold" style={{ fontSize: "1.25rem" }}>{row.photo.title}</div>
              <div className="mb-3" style={{ color: "#5a6272" }}>
                {row.photographer.name} · {row.photographer.location ?? "Worldwide"}
              </div>
              <table className="table table-sm align-middle mb-0" style={{ fontSize: "0.88rem" }}>
                <tbody>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700, width: "45%" }}>Serial number</td>
                    <td className="font-bold">{cert.serialNumber}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Edition</td>
                    <td>Print {row.item.editionNumber} of {totalEditions}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Print size</td>
                    <td>{row.size ? `${row.size.widthCm} × ${row.size.heightCm} cm` : "—"}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Mounting</td>
                    <td>{row.mount?.name ?? "Art Print"}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Acquired value</td>
                    <td>{formatInCurrency(parseFloat(row.item.lineTotal), currency)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Order</td>
                    <td>{row.order.orderNumber}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#8a7a4d", fontWeight: 700 }}>Issued</td>
                    <td>{formatDate(cert.issuedAt)}</td>
                  </tr>
                  {revokedAt && (
                    <tr>
                      <td style={{ color: "#b02a37", fontWeight: 700 }}>Status</td>
                      <td className="font-bold" style={{ color: "#b02a37" }}>
                        Révoqué — {formatDate(revokedAt)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 p-3" style={{ background: "#f3efe3", borderRadius: 8, fontSize: "0.78rem", color: "#6b6474" }}>
            <div className="font-bold mb-1" style={{ color: "#5a6272" }}>
              <BiIcon name="bi-shield-check" className="me-1" /> Verification hash
            </div>
            <code style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>{cert.watermarkHash}</code>
            <div className="mt-1" style={{ color: "#8a7a4d" }}>
              Verify at <Link href={`/certificates/${cert.serialNumber}`} style={{ color: "#8a7a4d" }}>{verifyUrl}</Link>
            </div>
          </div>

          <div className="flex justify-between items-end mt-4">
            <div style={{ fontSize: "0.72rem", color: "#8a7a4d" }}>
              This certificate confirms that the work above is an authentic
              <br />
              limited edition print from the Aperio collection.
            </div>
            <div className="text-center">
              <div style={{ borderTop: "1px solid #b79a4b", width: 180, paddingTop: 6, fontSize: "0.78rem", color: "#5a6272" }}>
                {row.photographer.name}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#8a7a4d" }}>Artist&rsquo;s signature</div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-muted-2 mt-4" style={{ fontSize: "0.8rem" }}>
        <BiIcon name="bi-patch-check-fill" className="me-1" />
        Every Aperio print ships with a physical certificate matching this record.
      </p>
    </div>
  );
}
