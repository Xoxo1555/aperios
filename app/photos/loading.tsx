import { Skeleton } from "components/ui/skeleton";

export default function PhotosLoading() {
  return (
    <div className="container py-5" aria-busy="true" aria-live="polite">
      <Skeleton type="text" rows={2} style={{ maxWidth: 420, marginBottom: 20 }} />
      <div className="row g-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={i}>
            <Skeleton type="image" style={{ height: 280, borderRadius: 16 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
