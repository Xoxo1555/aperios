import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, collectionPhotos, collections, photos, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { attachTags } from "@/lib/queries";
import { resolveAssetUrl } from "@/lib/utils";
import CollectionDetailView from "./CollectionDetailView";

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
    <CollectionDetailView
      name={coll.name}
      description={coll.description}
      photoCount={photoDtos.length}
      photos={photoDtos}
    />
  );
}