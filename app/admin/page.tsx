import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "lib/auth";
import AdminClient from "./AdminClient";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Aperio" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin");
  if (user.role !== "admin") redirect("/profile");

  return (
    <div className="container py-4" style={{ maxWidth: 1200 }}>
      <div className="flex flex-wrap items-center justify-between mb-4">
        <div>
          <div className="gallery-label">Back-office</div>
          <h1 className="font-display font-bold mb-1">Tableau de bord d&apos;administration</h1>
          <p className="text-muted-2 mb-0" style={{ fontSize: "0.95rem" }}>
            Pilotage des ventes, commissions, transactions et retraits automatisés.
          </p>
        </div>
        <Link href="/" className="btn btn-ghost">
          <BiIcon name="bi-house" className="me-1" />Retour au site
        </Link>
      </div>

      <AdminClient />
    </div>
  );
}
