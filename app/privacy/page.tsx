import type { Metadata } from "next";
import LegalPageClient from "components/LegalPageClient";

export const metadata: Metadata = {
  title: "Privacy policy · Aperio",
  description: "Aperio privacy policy: what data we collect, how we use it, cookies, and your rights over your personal data.",
};

export default function PrivacyPage() {
  return <LegalPageClient variant="privacy" />;
}
