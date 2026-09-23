import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "lib/auth";
import DashboardClient from "components/DashboardClient";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/dashboard");

  if (user.role === "buyer") {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: 560 }}>
        <BiIcon name="bi-lock" style={{ fontSize: "3rem", color: "var(--ap-muted)" }} />
        <h1 className="font-display font-bold mt-3">Creator dashboard</h1>
        <p className="text-muted-2 mb-4">
          Collector accounts are made for browsing, downloading, and collecting.
          Switch to an artist-creator account to publish and sell your work.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link href="/register" className="btn btn-gold">Become a creator</Link>
          <Link href="/photos" className="btn btn-ghost">Browse the gallery</Link>
        </div>
      </div>
    );
  }

  return <DashboardClient userName={user.name} />;
}
