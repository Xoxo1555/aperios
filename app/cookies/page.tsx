import type { Metadata } from "next";
import CookiesClient from "components/CookiesClient";

export const metadata: Metadata = {
  title: "Cookies settings · Aperio",
  description:
    "Manage your cookie preferences on Aperio: essential, analytics and marketing cookies · full transparency and control.",
};

export default function CookiesPage() {
  return <CookiesClient />;
}
