import type { Metadata } from "next";
import ContactClient from "components/ContactClient";

export const metadata: Metadata = {
  title: "Contact Aperio · Art gallery & photography",
  description: "Contact the Aperio studio and photo gallery. Customer service, artist support, questions about our certified fine art prints.",
};

export default function ContactPage() {
  return <ContactClient />;
}
