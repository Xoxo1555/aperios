import type { Metadata } from "next";
import HelpClient from "components/HelpClient";

export const metadata: Metadata = {
  title: "Help Center · Aperio",
  description: "Aperio help center: frequently asked questions about free photos and limited edition prints, plus how to contact support.",
};

export default function HelpPage() {
  return <HelpClient />;
}