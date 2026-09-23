import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "db";
import { users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { fmtEur } from "lib/format";
import PayoutClient from "./PayoutClient";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payouts · Aperio" };

export default async function PayoutPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/payout");
  if (user.role !== "photographer" && user.role !== "admin") redirect("/profile");

  const [fullUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/profile" className="text-muted-2" style={{ fontSize: "0.88rem" }}><BiIcon name="bi-chevron-left" />Back to profile</Link>
      </div>
      <div className="gallery-label">Creator earnings</div>
      <h1 className="font-display font-bold mb-2">Request a payout</h1>
      <p className="text-muted-2 mb-4" style={{ fontSize: "0.95rem" }}>
        Transfer your available balance to your Mobile Money account,
        Stripe, PayPal, or bank account. Processed within 2 to 5 business days.
      </p>

      <div className="row g-3 mb-4">
        <div className="col-md-6"><div className="stat-tile"><div className="value font-display">{fmtEur(fullUser.availableBalance)}</div><div className="label">Available balance</div></div></div>
        <div className="col-md-6"><div className="stat-tile"><div className="value font-display">{fullUser.payoutMethod ? "Configured" : "—"}</div><div className="label">Payment method</div></div></div>
      </div>

      <PayoutClient user={{ id: fullUser.id, availableBalance: fullUser.availableBalance, payoutMethod: fullUser.payoutMethod, payoutAccount: fullUser.payoutAccount, payoutName: fullUser.payoutName }} />
    </div>
  );
}
