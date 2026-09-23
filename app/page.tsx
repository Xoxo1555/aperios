import { db } from "db";
import { categories, photos, users } from "db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { fetchCategoryDtos, fetchPhotoDtos } from "lib/queries";
import HomeHero from "components/HomeHero";
import HomeSignature from "components/HomeSignature";
import HomeStats from "components/HomeStats";
import HomeCategories from "components/HomeCategories";
import HomeCarouselSection from "components/HomeCarouselSection";
import HomeCraft from "components/HomeCraft";
import HomeHowItWorks from "components/HomeHowItWorks";
import HomeCta from "components/HomeCta";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  /* Stats 100% dynamic from the database */
  const [
    categoryDtos, featuredFree, featuredArt, featuredMg, featuredCraft,
    stats,
  ] = await Promise.all([
    fetchCategoryDtos(),
    fetchPhotoDtos({ license: "free", featured: true, limit: 12 }),
    fetchPhotoDtos({ license: "limited", featured: true, limit: 10 }),
    fetchPhotoDtos({ photographerId: undefined }).then(() => fetchMgFeatured()),
    fetchPhotoDtos({ license: "limited", categorySlug: "fine-art-still-life", limit: 6 }),
    fetchStats(),
  ]);

  const craftCategory = categoryDtos.find((c) => c.slug === "fine-art-still-life");
  const artCategory = categoryDtos.find((c) => c.slug === "macro");

  return (
    <>
      {/* ============ HERO (i18n-reactive) ============ */}
      <HomeHero />

      {/* ============ STATS + ISALO — Atelier Ivoire : ivoire + cartes anthracite ============ */}
      <section className="container py-10 lg:py-12">
        <div className="row g-4 items-stretch">
          <HomeSignature />
          <HomeStats stats={stats} />
        </div>
      </section>

      {/* ============ CATEGORIES ============ */}
      <HomeCategories categories={categoryDtos} />

      {/* ============ MADAGASCAR CAROUSEL ============ */}
      <HomeCarouselSection
        labelKey="home_madagascar_label"
        titleKey="home_madagascar_title"
        subKey="home_madagascar_sub"
        linkKey="home_explore"
        linkHref="/photos?category=madagascar"
        linkVariant="gold"
        photos={featuredMg}
        variant="landscape"
      />

      {/* ============ FREE PHOTOS CAROUSEL ============ */}
      <HomeCarouselSection
        labelKey="home_free_label"
        titleKey="home_free_title"
        subKey="home_free_sub"
        linkKey="home_explore_all"
        linkHref="/photos"
        photos={featuredFree}
        variant="landscape"
      />

      {/* ============ MALAGASY ART & CRAFT ============ */}
      <HomeCraft photos={featuredCraft} craftCategory={craftCategory} artCategory={artCategory} />

      {/* ============ LIMITED EDITIONS GRID ============ */}
      <HomeCarouselSection
        labelKey="home_limited_label"
        titleKey="home_limited_title"
        subKey="home_limited_sub"
        linkKey="home_all_prints"
        linkHref="/prints"
        linkVariant="gold"
        photos={featuredArt}
        variant="grid"
      />

      {/* ============ HOW IT WORKS (i18n-reactive) ============ */}
      <HomeHowItWorks />

      {/* ============ CTA (i18n-reactive) ============ */}
      <HomeCta />
    </>
  );
}

async function fetchMgFeatured() {
  const rows = await db
    .select({ id: photos.id })
    .from(photos)
    .innerJoin(categories, eq(photos.categoryId, categories.id))
    .where(eq(categories.slug, "madagascar"))
    .orderBy(desc(photos.featured), desc(photos.likesCount))
    .limit(12);
  if (rows.length === 0) return [];
  return fetchPhotoDtos({ ids: rows.map((r) => r.id) });
}

async function fetchStats() {
  const [photosCount, photographersCount, freeCount, limitedCount, downloadsSum] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(photos).where(eq(photos.isPublished, true)),
    db.select({ c: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "photographer")),
    db.select({ c: sql<number>`count(*)::int` }).from(photos).where(eq(photos.licenseType, "free")),
    db.select({ c: sql<number>`count(*)::int` }).from(photos).where(eq(photos.licenseType, "limited")),
    db.select({ s: sql<number>`coalesce(sum(${photos.downloads}),0)::int` }).from(photos),
  ]);
  return {
    photos: photosCount[0].c,
    photographers: photographersCount[0].c,
    free: freeCount[0].c,
    limited: limitedCount[0].c,
    downloads: downloadsSum[0].s,
  };
}
