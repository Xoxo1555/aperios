import { Suspense } from "react";
import Browse from "components/Browse";
import { fetchCategoryDtos } from "lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free Photos · Aperio",
  description:
    "Browse and download free, high-resolution photos for any project · commercial or personal. Filter by orientation, color, category and more.",
};

export default async function PhotosPage() {
  const categories = (await fetchCategoryDtos()).filter((c) => c.kind !== "art");
  return (
    <Suspense
      fallback={
        <div className="container py-5 text-center">
          <div className="spinner-border text-warning" role="status" />
        </div>
      }
    >
      <Browse license="free" categories={categories} />
    </Suspense>
  );
}
