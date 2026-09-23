import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "db";
import {
  bookmarks,
  categories,
  collectionPhotos,
  collections,
  comments,
  mounts,
  photoTags,
  photos,
  printsConfig,
  shares,
  tags,
  users,
} from "db/schema";
import { photoRowToDto, type PhotoRow } from "./dto";
import type { CategoryDto, CollectionDto, MountDto, PhotoDto, PrintSizeDto } from "./types";

export type PhotoOrientation = "landscape" | "portrait" | "square";

export type PhotoSort = "popular" | "price_asc" | "price_desc" | "oldest" | "recent" | "latest" | "downloads";

export interface PhotoFilters {
  license?: "free" | "limited";
  /** Texte libre recherché sur title, description, localisation et catégorie. */
  q?: string;
  categorySlug?: string;
  orientation?: PhotoOrientation;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  excludeId?: number;
  ids?: number[];
  photographerId?: number;
  includeUnpublished?: boolean;
  limit?: number;
  offset?: number;
  sort?: PhotoSort;
}

/* Alias de catégories : on les normalise vers la catégorie canonique
   "Art & Artisanat" (fine-art-still-life) pour rester cohérent partout. */
const CATEGORY_ALIASES: Record<string, string> = {
  artcraft: "fine-art-still-life",
  "art-artisanat": "fine-art-still-life",
  "malagasy-craft": "fine-art-still-life",
  "malagasy-art": "fine-art-still-life",
  artisanat: "fine-art-still-life",
};

export function normalizeCategorySlug(slug: string): string {
  const normalized = slug.toLowerCase().trim();
  return CATEGORY_ALIASES[normalized] ?? normalized;
}

async function resolveCategoryId(categorySlug: string): Promise<number | null> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(ilike(categories.slug, categorySlug))
    .limit(1);
  return rows[0]?.id ?? null;
}

export interface BuildPhotoConditionsResult {
  conditions: SQL[];
  orderBy: SQL[];
  categoryNotFound: boolean;
  needsMetadataJoin: boolean;
}

function buildPhotoOrderBy(sort?: PhotoSort): SQL[] {
  switch (sort) {
    case "popular":
      return [desc(photos.featured), desc(photos.likesCount), desc(photos.id)];
    case "price_asc":
      return [asc(photos.basePrice), desc(photos.id)];
    case "price_desc":
      return [desc(photos.basePrice), desc(photos.id)];
    case "oldest":
      return [asc(photos.createdAt), desc(photos.id)];
    case "latest":
    case "recent":
      return [desc(photos.createdAt), desc(photos.id)];
    case "downloads":
      return [desc(photos.downloads), desc(photos.id)];
    default:
      return [desc(photos.featured), desc(photos.likesCount), desc(photos.id)];
  }
}

/**
 * Constructeur centralisé des conditions SQL des photos.
 * Utilisé à la fois par fetchPhotoDtos et countPhotosDto pour garantir
 * que la pagination et le total renvoyé appliquent EXACTEMENT les mêmes filtres.
 */
export async function buildPhotoWhereConditions(filters: PhotoFilters): Promise<BuildPhotoConditionsResult> {
  const conditions: SQL[] = [];
  const q = filters.q?.trim();
  let categoryNotFound = false;

  if (filters.license) conditions.push(eq(photos.licenseType, filters.license));
  if (filters.featured) conditions.push(eq(photos.featured, true));
  if (filters.ids && filters.ids.length > 0) conditions.push(inArray(photos.id, filters.ids));
  if (filters.photographerId) conditions.push(eq(photos.photographerId, filters.photographerId));
  if (filters.excludeId) conditions.push(ne(photos.id, filters.excludeId));
  if (filters.orientation) conditions.push(eq(photos.orientation, filters.orientation));
  if (filters.color) conditions.push(eq(photos.color, filters.color));
  if (filters.minPrice !== undefined && filters.minPrice >= 0) {
    conditions.push(gte(photos.basePrice, String(filters.minPrice)));
  }
  if (filters.maxPrice !== undefined && filters.maxPrice >= 0) {
    conditions.push(lte(photos.basePrice, String(filters.maxPrice)));
  }

  if (q) {
    const pattern = `%${q}%`;
    const search = or(
      ilike(photos.title, pattern),
      ilike(photos.description, pattern),
      ilike(users.location, pattern),
      ilike(categories.name, pattern),
    );
    if (search) conditions.push(search);
  }

  if (filters.categorySlug) {
    const normalized = normalizeCategorySlug(filters.categorySlug);
    const categoryId = await resolveCategoryId(normalized);
    if (categoryId === null) {
      categoryNotFound = true;
    } else {
      conditions.push(eq(photos.categoryId, categoryId));
    }
  }

  // Par défaut, on ne montre que les photos publiées, sauf si includeUnpublished est explicitement true
  if (filters.includeUnpublished !== true) {
    conditions.push(eq(photos.isPublished, true));
  }

  return {
    conditions,
    orderBy: buildPhotoOrderBy(filters.sort),
    categoryNotFound,
    needsMetadataJoin: Boolean(q),
  };
}

export async function fetchPhotoDtos(opts: PhotoFilters = {}): Promise<PhotoDto[]> {
  const { conditions, orderBy, categoryNotFound, needsMetadataJoin } = await buildPhotoWhereConditions(opts);
  if (categoryNotFound) return [];

  // Le filtre de recherche textuelle référence categories et users, il faut donc
  // joindre ces tables dans la sous-requête qui sélectionne les IDs paginés.
  let idsQuery = db.select({ id: photos.id }).from(photos).$dynamic();
  if (needsMetadataJoin) {
    idsQuery = idsQuery
      .leftJoin(categories, eq(photos.categoryId, categories.id))
      .innerJoin(users, eq(photos.photographerId, users.id));
  }
  idsQuery = idsQuery
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  const photoIdsSubquery = idsQuery.as("photo_ids");

  // Try the full query with counts, fallback to simple query if tables don't exist
  let rows: (PhotoRow & { commentsCount: number; bookmarksCount: number; sharesCount: number })[];
  try {
    rows = await db
      .select({
        photo: photos,
        category: categories,
        photographer: users,
        commentsCount: sql<number>`count(distinct ${comments.id})::int`,
        bookmarksCount: sql<number>`count(distinct ${bookmarks.userId})::int`,
        sharesCount: sql<number>`count(distinct ${shares.id})::int`,
      })
      .from(photoIdsSubquery)
      .innerJoin(photos, eq(photos.id, photoIdsSubquery.id))
      .leftJoin(categories, eq(photos.categoryId, categories.id))
      .innerJoin(users, eq(photos.photographerId, users.id))
      .leftJoin(comments, eq(comments.photoId, photos.id))
      .leftJoin(bookmarks, eq(bookmarks.photoId, photos.id))
      .leftJoin(shares, eq(shares.photoId, photos.id))
      .groupBy(photos.id, categories.id, users.id)
      .orderBy(...orderBy);
  } catch (error) {
    console.warn("Failed to fetch reaction counts, falling back to basic query:", error);
    // Fallback: fetch without counts
    const fallbackRows = await db
      .select({
        photo: photos,
        category: categories,
        photographer: users,
      })
      .from(photoIdsSubquery)
      .innerJoin(photos, eq(photos.id, photoIdsSubquery.id))
      .leftJoin(categories, eq(photos.categoryId, categories.id))
      .innerJoin(users, eq(photos.photographerId, users.id))
      .groupBy(photos.id, categories.id, users.id)
      .orderBy(...orderBy);

    // Add zero counts
    rows = fallbackRows.map(r => ({
      ...r,
      commentsCount: 0,
      bookmarksCount: 0,
      sharesCount: 0,
    }));
  }

  return attachTagsWithCounts(rows);
}

export async function countPhotosDto(filters: PhotoFilters): Promise<number> {
  const { conditions, categoryNotFound, needsMetadataJoin } = await buildPhotoWhereConditions(filters);
  if (categoryNotFound) return 0;

  let query = db.select({ c: sql<number>`count(*)::int` }).from(photos).$dynamic();
  if (needsMetadataJoin) {
    query = query
      .leftJoin(categories, eq(photos.categoryId, categories.id))
      .innerJoin(users, eq(photos.photographerId, users.id));
  }
  const rows = await query.where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows[0].c;
}

export async function attachTags(rows: PhotoRow[]): Promise<PhotoDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.photo.id);
  const tagRows = await db
    .select({
      photoId: photoTags.photoId,
      name: tags.name,
      slug: tags.slug,
    })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(inArray(photoTags.photoId, ids));

  const map = new Map<number, Array<{ name: string; slug: string }>>();
  for (const t of tagRows) {
    const list = map.get(t.photoId) ?? [];
    list.push({ name: t.name, slug: t.slug });
    map.set(t.photoId, list);
  }
  return rows.map((r) => photoRowToDto({ ...r, tags: map.get(r.photo.id) ?? [] }));
}

export async function attachTagsWithCounts(rows: (PhotoRow & { commentsCount: number; bookmarksCount: number; sharesCount: number })[]): Promise<PhotoDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.photo.id);
  const tagRows = await db
    .select({
      photoId: photoTags.photoId,
      name: tags.name,
      slug: tags.slug,
    })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(inArray(photoTags.photoId, ids));

  const map = new Map<number, Array<{ name: string; slug: string }>>();
  for (const t of tagRows) {
    const list = map.get(t.photoId) ?? [];
    list.push({ name: t.name, slug: t.slug });
    map.set(t.photoId, list);
  }
  return rows.map((r) => photoRowToDto({ ...r, tags: map.get(r.photo.id) ?? [] }));
}

export async function fetchCategoryDtos(): Promise<CategoryDto[]> {
  const rows = await db.select().from(categories).orderBy(categories.sort);
  
  // For each category, fetch a cover photo that STRICTLY belongs to this category
  const categoriesWithCovers = await Promise.all(
    rows.map(async (c) => {
      const coverPhoto = await db
        .select({ imageUrl: photos.imageUrl })
        .from(photos)
        .where(and(eq(photos.categoryId, c.id), eq(photos.isPublished, true)))
        .orderBy(desc(photos.featured), desc(photos.likesCount), desc(photos.id))
        .limit(1);
      
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        kind: c.kind,
        description: c.description,
        coverUrl: coverPhoto[0]?.imageUrl ?? null,
      };
    })
  );
  
  return categoriesWithCovers;
}

export async function countPhotos(license?: "free" | "limited"): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(photos)
    .where(license ? eq(photos.licenseType, license) : undefined);
  return rows[0].c;
}

export async function fetchPrintSizes(): Promise<PrintSizeDto[]> {
  const rows = await db.select().from(printsConfig).orderBy(printsConfig.sort);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    widthCm: r.widthCm,
    heightCm: r.heightCm,
    multiplier: parseFloat(r.multiplier),
  }));
}

export async function fetchMounts(): Promise<MountDto[]> {
  const rows = await db.select().from(mounts).orderBy(mounts.sort);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    multiplier: parseFloat(r.multiplier),
    surcharge: parseFloat(r.surcharge),
  }));
}

export async function fetchMyCollections(userId: number): Promise<CollectionDto[]> {
  const colls = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));
  if (colls.length === 0) return [];

  const ids = colls.map((c) => c.id);
  const counts = await db
    .select({ id: collectionPhotos.collectionId, c: sql<number>`count(*)::int` })
    .from(collectionPhotos)
    .where(inArray(collectionPhotos.collectionId, ids))
    .groupBy(collectionPhotos.collectionId);
  const countMap = new Map(counts.map((r) => [r.id, r.c]));

  const coverRows = await db
    .select({ collectionId: collectionPhotos.collectionId, url: photos.imageUrl })
    .from(collectionPhotos)
    .innerJoin(photos, eq(collectionPhotos.photoId, photos.id))
    .where(inArray(collectionPhotos.collectionId, ids))
    .orderBy(collectionPhotos.addedAt)
    .limit(600);
  const coverMap = new Map<number, string>();
  for (const r of coverRows) {
    if (!coverMap.has(r.collectionId)) coverMap.set(r.collectionId, r.url);
  }

  return colls.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    isPublic: c.isPublic,
    photoCount: countMap.get(c.id) ?? 0,
    coverUrl: coverMap.get(c.id) ?? null,
  }));
}

export async function countPhotographers(): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "photographer"));
  return rows[0].c;
}

export async function sumDownloads(): Promise<number> {
  const rows = await db
    .select({ s: sql<number>`coalesce(sum(${photos.downloads}), 0)::int` })
    .from(photos);
  return rows[0].s;
}