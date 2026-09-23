import Link from "next/link";
import { getSessionUser } from "lib/auth";
import { fetchMyCollections } from "lib/queries";
import NewCollectionForm from "components/NewCollectionForm";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Collections" };

export default async function CollectionsPage() {
  const user = await getSessionUser();
  const collections = user ? await fetchMyCollections(user.id) : [];

  return (
    <div className="container py-4">
      <div className="flex flex-wrap items-end justify-between mb-4">
        <div>
          <h1 className="font-display font-bold mb-1">My collections</h1>
          <p className="text-muted-2 mb-0">
            Keep photos in themed collections · private by default, shareable whenever you choose.
          </p>
        </div>
        <NewCollectionForm />
      </div>

      {collections.length === 0 ? (
        <div className="text-center py-5 bg-surface rounded-2xl">
          <BiIcon name="bi-heart" style={{ fontSize: "3rem", color: "var(--ap-muted)" }} />
          <h5 className="mt-3">No collections yet</h5>
          <p className="text-muted-2 mb-3">Save the photos you love to your first collection.</p>
          <Link href="/photos" className="btn btn-gold">Browse the gallery</Link>
        </div>
      ) : (
        <div className="row g-4">
          {collections.map((c) => (
            <div className="col-6 col-md-4 col-lg-3" key={c.id}>
              <Link href={`/collections/${c.slug}`} className="category-card" style={{ aspectRatio: "1 / 1" }}>
                {c.coverUrl ? (
                  <Image
                    src={c.coverUrl}
                    alt={c.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                    unoptimized={process.env.NODE_ENV === "development"}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--ap-surface-2)" }}>
                    <BiIcon name="bi-images" style={{ fontSize: "2.4rem", color: "var(--ap-muted)" }} />
                  </div>
                )}
                <div className="cat-label">
                  <div className="font-bold font-display" style={{ fontSize: "1rem" }}>{c.name}</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                    {c.photoCount} photo{c.photoCount === 1 ? "" : "s"} · {c.isPublic ? "Public" : "Private"}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
