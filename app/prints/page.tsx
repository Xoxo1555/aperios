import { Suspense } from "react";
import Browse from "components/Browse";
import { fetchCategoryDtos } from "lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Limited Edition Fine Art Prints",
  description:
    "Own numbered, certified limited-edition fine art prints. Customize size and mounting, and check edition availability in real time.",
};

export default async function PrintsPage() {
  const categories = (await fetchCategoryDtos()).filter((c) => c.kind !== "stock");
  return (
    <Suspense
      fallback={
        <div className="container py-5 text-center">
          <div className="spinner-border text-warning" role="status" />
        </div>
      }
    >
      <Browse license="limited" categories={categories} />
    </Suspense>
  );
}
