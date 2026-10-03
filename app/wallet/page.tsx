import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "lib/auth";
import { getWalletBalance, getWalletTransactions } from "lib/wallet";
import type { WalletTransactionDto } from "lib/types";
import WalletClient from "./WalletClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse } from "@fortawesome/free-regular-svg-icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet · Aperio" };

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/wallet");

  const [balance, transactions] = await Promise.all([
    getWalletBalance(user.id),
    getWalletTransactions(user.id, 50),
  ]);

  return (
    <div className="container py-4" style={{ maxWidth: 860 }}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/profile" title="Accueil" aria-label="Accueil" className="p-2 rounded-full hover:bg-neutral-800/50 transition-colors inline-flex items-center justify-center">
          <FontAwesomeIcon icon={faHouse} />
        </Link>
      </div>
      <WalletClient
        balance={balance}
        transactions={transactions.map(
          (tx): WalletTransactionDto => ({
            id: tx.id,
            reference: tx.reference,
            amount: tx.amount,
            type: tx.type,
            status: tx.status,
            paymentMethod: tx.paymentMethod,
            transactionReference: tx.transactionReference,
            createdAt: tx.createdAt.toISOString(),
          }),
        )}
      />
    </div>
  );
}