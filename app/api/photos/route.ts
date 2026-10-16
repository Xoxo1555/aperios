import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookmarks } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { countPhotosDto, fetchPhotoDtos, normalizeCategorySlug } from "@/lib/queries";
import type { PhotoOrientation, PhotoSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

const LICENSES = new Set(["free", "limited"]);
const ORIENTATIONS = new Set<PhotoOrientation>(["landscape", "portrait", "square"]);
const SORTS = new Set<PhotoSort>(["popular", "price_asc", "price_desc", "oldest", "recent", "latest", "downloads"]);

const PER_PAGE_MIN = 1;
const PER_PAGE_MAX = 100;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePrice(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() || undefined;
  const licenseParam = searchParams.get("license");
  const categoryParam = searchParams.get("category");
  const orientationParam = searchParams.get("orientation");
  const color = searchParams.get("color")?.trim() || undefined;
  const sortParam = searchParams.get("sort");
  const minPrice = parsePrice(searchParams.get("min"));
  const maxPrice = parsePrice(searchParams.get("max"));

  if (licenseParam && !LICENSES.has(licenseParam)) {
    return NextResponse.json(
      { error: "license must be 'free' or 'limited'" },
      { status: 400 }
    );
  }
  const license = licenseParam as "free" | "limited" | undefined;

  const orientation =
    orientationParam && ORIENTATIONS.has(orientationParam as PhotoOrientation)
      ? (orientationParam as PhotoOrientation)
      : undefined;

  const sort =
    sortParam && SORTS.has(sortParam as PhotoSort) ? (sortParam as PhotoSort) : undefined;

  // Page et pagination strictement bornées pour éviter toute surcharge serveur.
  const page = Math.max(1, parsePositiveInt(searchParams.get("page"), 1));
  const perPage = clamp(parsePositiveInt(searchParams.get("perPage"), 24), PER_PAGE_MIN, PER_PAGE_MAX);
  const limit = clamp(parsePositiveInt(searchParams.get("limit"), perPage), PER_PAGE_MIN, PER_PAGE_MAX);

  const offset = (page - 1) * perPage;

  const categorySlug = categoryParam ? normalizeCategorySlug(categoryParam) : undefined;

  const photosData = await fetchPhotoDtos({
    license,
    q,
    categorySlug,
    orientation,
    color,
    minPrice,
    maxPrice,
    sort,
    limit,
    offset,
  });

  // Le comptage applique exactement les mêmes filtres que la sélection,
  // pour que total/totalPages soient toujours cohérents avec la page renvoyée.
  const total = await countPhotosDto({
    license,
    q,
    categorySlug,
    orientation,
    color,
    minPrice,
    maxPrice,
  });

  const totalPages = Math.ceil(total / perPage);

  /* Per-viewer bookmark state so the grid cards (PhotoCard) start in the same
   * state as the detail page — no flash from unsaved to saved. */
  let photos = photosData;
  const viewer = await getSessionUser();
  if (viewer && photosData.length > 0) {
    const savedRows = await db
      .select({ photoId: bookmarks.photoId })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, viewer.id),
          inArray(bookmarks.photoId, photosData.map((p) => p.id)),
        ),
      );
    const saved = new Set(savedRows.map((r) => r.photoId));
    photos = photosData.map((p) => ({ ...p, isBookmarked: saved.has(p.id) }));
  }

  return NextResponse.json({
    photos,
    total,
    totalPages,
    category: categorySlug,
  });
}