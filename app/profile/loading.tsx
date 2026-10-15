import { Skeleton } from "components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="container py-5" aria-busy="true" aria-live="polite">
      <div className="d-flex align-items-center gap-3 mb-4">
        <Skeleton type="icon" style={{ width: 72, height: 72, borderRadius: "50%" }} />
        <div style={{ flex: 1 }}>
          <Skeleton type="text" rows={2} style={{ maxWidth: 320 }} />
        </div>
      </div>
      <div className="row g-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="col-12 col-sm-6 col-lg-4" key={i}>
            <Skeleton type="image" style={{ height: 200 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
