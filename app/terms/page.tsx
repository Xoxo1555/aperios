import type { Metadata } from "next";
import LegalPageClient from "components/LegalPageClient";

export const metadata: Metadata = {
  title: "Terms of sale · Aperio",
  description: "Terms of sale on the Aperio platform: prices and payment, shipping and delivery, certificates of authenticity, refunds and returns.",
};

export default function TermsPage() {
  return <LegalPageClient variant="terms" />;
}
