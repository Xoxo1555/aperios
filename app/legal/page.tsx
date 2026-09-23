import type { Metadata } from "next";
import LegalPageClient from "components/LegalPageClient";

export const metadata: Metadata = {
  title: "Legal notice · Aperio",
  description: "Legal information about Aperio Studio: publisher, hosting and contact details for the aperio.gallery platform.",
};

export default function LegalPage() {
  return <LegalPageClient variant="legal" />;
}
