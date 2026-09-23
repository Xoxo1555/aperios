import type { Metadata } from "next";
import PricingClient from "components/PricingClient";
import { PLATFORM_COMMISSION_RATE } from "lib/orders";
import { shippingFor } from "lib/pricing";

export const metadata: Metadata = {
  title: "Pricing & Commissions · Aperio",
  description: "Clear, honest pricing: creators keep 80% of art print sales and 100% of donations. Free photos for buyers, secure deliveries. No hidden fees, ever.",
};

export default function PricingPage() {
  const commissionPct = Math.round(PLATFORM_COMMISSION_RATE * 100);
  const creatorSharePct = 100 - commissionPct;
  const freeShippingThreshold = 300;
  const standardShipping = shippingFor(0);

  return (
    <PricingClient
      commissionPct={commissionPct}
      creatorSharePct={creatorSharePct}
      freeShippingThreshold={freeShippingThreshold}
      standardShipping={standardShipping}
    />
  );
}