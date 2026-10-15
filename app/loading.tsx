import { Skeleton } from "components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container py-5" aria-busy="true" aria-live="polite">
      <Skeleton type="text" rows={2} style={{ maxWidth: 480, marginBottom: 24 }} />
      <div className="row g-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="col-12 col-sm-6 col-lg-3" key={i}>
            <Skeleton type="image" style={{ height: 220 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
