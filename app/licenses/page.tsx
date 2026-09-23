import type { Metadata } from "next";
import LicensesClient from "components/LicensesClient";

export const metadata: Metadata = {
  title: "Licenses & Usage Rights · Aperio",
  description: "Aperio licenses and usage rights: the free Aperio license for photographs and the limited edition fine art print license.",
};

export default function LicensesPage() {
  return <LicensesClient />;
}