import "server-only";
import type { CategoryDto, PhotoDto } from "./types";
import type { categories, photos, users } from "db/schema";

export interface PhotoRow {
  photo: typeof photos.$inferSelect;
  category: (typeof categories.$inferSelect) | null;
  photographer: typeof users.$inferSelect;
  tags?: Array<{ name: string; slug: string }>;
  commentsCount?: number;
  bookmarksCount?: number;
  sharesCount?: number;
}

export function photoRowToDto(row: PhotoRow): PhotoDto {
  const p = row.photo;
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    imageUrl: p.imageUrl,
    thumbUrl: p.thumbUrl,
    width: p.width,
    height: p.height,
    orientation: p.orientation,
    color: p.color,
    licenseType: p.licenseType,
    category: row.category
      ? { id: row.category.id, name: row.category.name, slug: row.category.slug, icon: row.category.icon }
      : null,
    photographer: {
      id: row.photographer.id,
      name: row.photographer.name,
      avatarUrl: row.photographer.avatarUrl,
      location: row.photographer.location,
      bio: row.photographer.bio,
      website: row.photographer.website,
      donationLink: row.photographer.donationLink,
      instagram: row.photographer.instagram,
    },
    tags: row.tags ?? [],
    basePrice: parseFloat(p.basePrice),
    totalEditions: p.totalEditions,
    availableStock: p.availableStock,
    downloads: p.downloads,
    views: p.views,
    likesCount: p.likesCount,
    commentsCount: row.commentsCount ?? 0,
    bookmarksCount: row.bookmarksCount ?? 0,
    sharesCount: row.sharesCount ?? 0,
    featured: p.featured,
    hasHd: !!p.hdPath,
    exif: p.exif as Record<string, unknown> | null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function categoryToDto(c: typeof categories.$inferSelect): CategoryDto {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    kind: c.kind,
    description: c.description,
    coverUrl: c.coverUrl,
  };
}
