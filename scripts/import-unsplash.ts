import dotenv from "dotenv";
import { assertLocalDatabase } from "./lib/assert-local-db";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

/* Garde-fou : jamais d'import massif vers une base non locale. */
assertLocalDatabase();

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API = "https://api.unsplash.com/search/photos";

if (!UNSPLASH_ACCESS_KEY) {
  console.error("❌ ERREUR : UNSPLASH_ACCESS_KEY est introuvable dans .env.local !");
  process.exit(1);
} else {
  console.log("✅ Clé API Unsplash chargée avec succès !");
}

interface UnsplashPhoto {
  id: string;
  urls: {
    regular: string;
    full: string;
    small: string;
    thumb: string;
  };
  alt_description: string | null;
  description: string | null;
  width: number;
  height: number;
  color: string | null;
  user: {
    name: string;
    username: string;
  };
}

interface CategoryMap {
  slug: string;
  id: number;
  searchQueries: string[];
  licenseType: "free" | "limited";
  count: number;
}

async function searchUnsplash(query: string, perPage: number = 30, orientation?: string): Promise<UnsplashPhoto[]> {
  const url = new URL(UNSPLASH_API);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));
  if (orientation) url.searchParams.set("orientation", orientation);
  url.searchParams.set("content_filter", "high");

  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        "Accept-Version": "v1",
      },
    });

    if (res.status === 429 || res.status === 403) {
      const retryAfter = res.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : attempt * 20000;
      console.log(`    ⏳ Rate limited (${res.status}), waiting ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, waitTime));
      continue;
    }

    if (!res.ok) {
      let errText = "";
      try {
        const text = await res.text();
        errText = text;
      } catch {
        errText = "Unable to read error response";
      }
      throw new Error(`Unsplash API error: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return data.results ?? [];
  }

  throw lastError || new Error("Max retries exceeded");
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function makeUniqueSlug(base: string, taken: Set<string>): string {
  let slug = slugify(base);
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  let i = 2;
  while (taken.has(`${slug}-${i}`)) i++;
  const unique = `${slug}-${i}`;
  taken.add(unique);
  return unique;
}

async function main() {
  console.log("🔄 Starting optimized Unsplash import…");

  // Dynamic imports after env is loaded
  const { db } = await import("../db");
  const { eq } = await import("drizzle-orm");
  const schema = await import("../db/schema");
  const { photos, photoTags, likes, bookmarks, comments, shares, certificates, orderItems, orders, collections, collectionPhotos, categories, users } = schema;

  /* 1. RESET OBLIGATOIRE — wipe all photos and related data */
  console.log("  🗑️  Wiping existing photos and related tables…");
  await db.delete(certificates);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(collectionPhotos);
  await db.delete(collections);
  await db.delete(shares);
  await db.delete(comments);
  await db.delete(bookmarks);
  await db.delete(likes);
  await db.delete(photoTags);
  await db.delete(photos);
  console.log("  ✓ Database cleaned");

  /* 2. Fetch existing categories from DB */
  const categoryRows = await db.select().from(categories);
  const catBySlug = new Map(categoryRows.map((c) => [c.slug, c]));
  console.log(`  📂 Found ${categoryRows.length} categories:`, [...catBySlug.keys()].join(", "));

  /* 3. Define search mappings — ONE broad query per category to minimize API calls */
  const searchMappings: CategoryMap[] = [
    {
      slug: "madagascar",
      id: catBySlug.get("madagascar")?.id ?? 0,
      searchQueries: ["madagascar landscape nature"],
      licenseType: "free" as const,
      count: 20,
    },
    {
      slug: "nature-landscapes",
      id: catBySlug.get("nature-landscapes")?.id ?? 0,
      searchQueries: ["tropical nature landscape"],
      licenseType: "free" as const,
      count: 20,
    },
    {
      slug: "fine-art-still-life",
      id: catBySlug.get("fine-art-still-life")?.id ?? 0,
      searchQueries: ["african artisan craft still life"],
      licenseType: "limited" as const,
      count: 20,
    },
    {
      slug: "macro",
      id: catBySlug.get("macro")?.id ?? 0,
      searchQueries: ["macro texture nature abstract"],
      licenseType: "limited" as const,
      count: 15,
    },
    {
      slug: "wildlife",
      id: catBySlug.get("wildlife")?.id ?? 0,
      searchQueries: ["madagascar wildlife lemur chameleon"],
      licenseType: "free" as const,
      count: 20,
    },
    {
      slug: "urban-architecture",
      id: catBySlug.get("urban-architecture")?.id ?? 0,
      searchQueries: ["city architecture street"],
      licenseType: "free" as const,
      count: 20,
    },
    {
      slug: "travel",
      id: catBySlug.get("travel")?.id ?? 0,
      searchQueries: ["madagascar travel adventure"],
      licenseType: "free" as const,
      count: 20,
    },
    {
      slug: "aerial",
      id: catBySlug.get("aerial")?.id ?? 0,
      searchQueries: ["madagascar aerial drone view"],
      licenseType: "free" as const,
      count: 15,
    },
    {
      slug: "abstract",
      id: catBySlug.get("abstract")?.id ?? 0,
      searchQueries: ["abstract nature texture pattern"],
      licenseType: "free" as const,
      count: 15,
    },
    {
      slug: "street",
      id: catBySlug.get("street")?.id ?? 0,
      searchQueries: ["antananarivo street life market"],
      licenseType: "free" as const,
      count: 15,
    },
    {
      slug: "people",
      id: catBySlug.get("people")?.id ?? 0,
      searchQueries: ["people portrait culture"],
      licenseType: "free" as const,
      count: 20,
    },
  ].filter((m) => m.id > 0);

  console.log(`  🎯 Will import for ${searchMappings.length} categories`);

  /* 4. Fetch photographers (users with role photographer) */
  const userRows = await db.select().from(users);
  const photographers = userRows.filter((u) => u.role === "photographer");
  if (photographers.length === 0) {
    console.error("❌ No photographers found in database");
    process.exit(1);
  }
  console.log(`  📸 ${photographers.length} photographers available`);

  /* 5. Import photos per category — ONE request per category, max 20 results, max 2 per photographer */
  const takenSlugs = new Set<string>();
  const usedUnsplashIds = new Set<string>();
  let totalInserted = 0;

  for (const mapping of searchMappings) {
    console.log(`\n  📁 Category: ${mapping.slug} (target: ${mapping.count})`);

    // Single request per category with per_page=20 (max results)
    const query = mapping.searchQueries[0];
    const perPage = 20;
    const orientation = Math.random() > 0.5 ? "landscape" : "portrait";
    console.log(`    🔍 "${query}" (${orientation}) [${perPage}]`);
    const results = await searchUnsplash(query, perPage, orientation);

    // Filter out already used photos
    const newResults = results.filter(p => !usedUnsplashIds.has(p.id));
    for (const p of newResults) usedUnsplashIds.add(p.id);

    if (newResults.length === 0) {
      console.log(`    ⚠️  No new results for ${mapping.slug}`);
      continue;
    }

    // Select max 2 photos per photographer for diversity
    const photographerCount = new Map<string, number>();
    const selectedPhotos: UnsplashPhoto[] = [];

    for (const photo of newResults) {
      const photogName = photo.user?.username || photo.user?.name || "unknown";
      const count = photographerCount.get(photogName) || 0;
      if (count < 2) {
        selectedPhotos.push(photo);
        photographerCount.set(photogName, count + 1);
      }
      if (selectedPhotos.length >= mapping.count) break;
    }

    console.log(`    📸 Unique photographers selected: ${photographerCount.size} (from ${newResults.length} results)`);

    // Ensure orientation variety
    const landscapePhotos = selectedPhotos.filter(p => p.width > p.height);
    const portraitPhotos = selectedPhotos.filter(p => p.height > p.width);
    const squarePhotos = selectedPhotos.filter(p => p.width === p.height);

    const targetLandscape = Math.floor(mapping.count * 0.6);
    const targetPortrait = Math.floor(mapping.count * 0.35);
    const targetSquare = mapping.count - targetLandscape - targetPortrait;

    const finalPhotos: UnsplashPhoto[] = [];
    finalPhotos.push(...landscapePhotos.slice(0, targetLandscape));
    finalPhotos.push(...portraitPhotos.slice(0, targetPortrait));
    finalPhotos.push(...squarePhotos.slice(0, targetSquare));

    // Fill remaining slots
    const remaining = mapping.count - finalPhotos.length;
    if (remaining > 0) {
      const remainingPhotos = selectedPhotos.filter(p => !finalPhotos.includes(p));
      finalPhotos.push(...remainingPhotos.slice(0, remaining));
    }

    // Shuffle for variety
    for (let i = finalPhotos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalPhotos[i], finalPhotos[j]] = [finalPhotos[j], finalPhotos[i]];
    }

    const photoValues: typeof photos.$inferInsert[] = [];
    let inserted = 0;

    for (const photo of finalPhotos) {
      if (inserted >= mapping.count) break;

      const photographer = photographers[Math.floor(Math.random() * photographers.length)];
      const title = photo.alt_description ?? photo.description ?? `Unsplash photo ${photo.id.slice(0, 8)}`;
      const slug = makeUniqueSlug(title, takenSlugs);

      const orientation = photo.width > photo.height ? "landscape" : photo.height > photo.width ? "portrait" : "square";

      const totalEditions =
        mapping.licenseType === "limited"
          ? [8, 10, 15, 20, 25, 30, 40, 50][Math.floor(Math.random() * 8)]
          : null;

      photoValues.push({
        title: title.slice(0, 200),
        slug,
        description: photo.description ?? `${title}. ${mapping.licenseType === "free" ? "Free for commercial and personal use." : "Limited edition art print, numbered and certified."}`,
        imageUrl: photo.urls.regular,
        thumbUrl: photo.urls.small,
        width: photo.width,
        height: photo.height,
        orientation,
        color: photo.color,
        licenseType: mapping.licenseType,
        categoryId: mapping.id,
        photographerId: photographer.id,
        basePrice: mapping.licenseType === "limited" ? String(Math.floor(Math.random() * 500) + 150) : "0",
        totalEditions,
        /* Stock toujours borné par totalEditions (jamais 1..30 indépendant) :
         * sinon le CHECK photos_edition_bounds ferait échouer l'import. */
        availableStock: totalEditions === null ? null : Math.floor(Math.random() * totalEditions) + 1,
        exif: null,
        downloads: 0,
        views: 0,
        likesCount: 0,
        featured: mapping.licenseType === "limited" && Math.random() < 0.15,
        isPublished: true,
      });
      inserted++;
    }

    if (photoValues.length > 0) {
      await db.insert(photos).values(photoValues);
      totalInserted += photoValues.length;
      console.log(`    ✓ Inserted ${photoValues.length} photos into ${mapping.slug} (L: ${photoValues.filter(p => p.orientation === "landscape").length}, P: ${photoValues.filter(p => p.orientation === "portrait").length}, S: ${photoValues.filter(p => p.orientation === "square").length})`);
    }

    // Small delay between categories to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Import complete! Total photos inserted: ${totalInserted}`);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});