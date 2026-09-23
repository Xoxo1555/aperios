import type { MetadataRoute } from "next";
import "server-only";

import { db } from "db";
import { photos, collections } from "db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://aperio.com";

  // Static pages
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/prints`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/about`, changeFrequency: "yearly", priority: 0.5 },
  ];

  // Photos from database
  const allPhotos = await db
    .select({ id: photos.id, slug: photos.slug })
    .from(photos)
    .where(eq(photos.isPublished, true))
    .orderBy(desc(photos.id));

  const photoUrls: MetadataRoute.Sitemap = allPhotos.map((photo) => ({
    url: `${baseUrl}/photo/${photo.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  // Collections from database
  const allCollections = await db
    .select({ id: collections.id, slug: collections.slug })
    .from(collections)
    .where(eq(collections.isPublic, true))
    .orderBy(desc(collections.id));

  const collectionUrls: MetadataRoute.Sitemap = allCollections.map((coll) => ({
    url: `${baseUrl}/collections/${coll.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticUrls, ...photoUrls, ...collectionUrls];
}
