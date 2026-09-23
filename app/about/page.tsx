import type { Metadata } from "next";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About Aperio · Art gallery & photography",
  description: "Aperio is the first photography and digital art gallery dedicated to the talents and creators of Madagascar and Africa: certified art prints, royalty-free photos.",
};

export default function AboutPage() {
  return <AboutClient />;
}
