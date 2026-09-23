import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, collectionPhotos, collections, photos, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { attachTags } from "@/lib/queries";
import { resolveAssetUrl } from "@/lib/utils";
import PhotoCard from "@/components/PhotoCard";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getSessionUser();

  const [coll] = await db
    .select()
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);
  if (!coll) return { title: "Collection not found" };

  const title = `${coll.name} · Aperio`;
  const description = coll.description || "A curated collection of photographs";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: resolveAssetUrl((coll as any).coverUrl || "/images/logo-badge.png"),
          alt: coll.name,
        },
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) notFound();

  const [coll] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.userId, user.id)))
    .limit(1);
  if (!coll) notFound();

  const rows = await db
    .select({ photo: photos, category: categories, photographer: users })
    .from(collectionPhotos)
    .innerJoin(photos, eq(collectionPhotos.photoId, photos.id))
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .innerJoin(users, eq(photos.photographerId, users.id))
    .where(eq(collectionPhotos.collectionId, coll.id))
    .orderBy(desc(collectionPhotos.addedAt))
    .limit(60);

  const photoDtos = await attachTags(rows);

  return (
    <div className="container py-4">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0" style={{ fontSize: "0.85rem" }}>
          <li className="breadcrumb-item"><Link href="/collections">Collections</Link></li>
          <li className="breadcrumb-item active" aria-current="page" style={{ color: "var(--ap-muted)" }}>{coll.name}</li>
        </ol>
      </nav>

      <div className="flex items-center gap-3 mb-4">
        <span className="icon-btn" style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" }}>
          <BiIcon name="bi-heart" className="text-gold" style={{ fontSize: "1.3rem" }} />
        </span>
        <div>
          <h1 className="font-display font-bold mb-0">{coll.name}</h1>
          <p className="text-muted-2 mb-0">
            {coll.description ?? "A curated collection"} · {photoDtos.length} photos
          </p>
        </div>
      </div>

      {photoDtos.length === 0 ? (
        <div className="text-center" style={{ background: "var(--ap-card)", border: "1px solid var(--ap-border)", borderRadius: 16, padding: "3rem 1rem", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <span className="inline-flex items-center justify-center rounded-circle mx-auto mb-3" style={{ width: 72, height: 72, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BiIcon name="bi-bookmark-heart" style={{ fontSize: "1.9rem", color: "var(--ap-gold)" }} />
          </span>
          <h2 className="font-display font-bold mb-0" style={{ fontSize: "1.25rem", color: "var(--ap-card-foreground)" }}>This collection is empty.</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {photoDtos.map((p) => (
            <PhotoCard key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}
