import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  collectionPhotos,
  collections,
  likes,
  photos,
  users,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { photoRowToDto } from "@/lib/dto";
import {
  attachTags,
  fetchMounts,
  fetchMyCollections,
  fetchPhotoDtos,
  fetchPrintSizes,
} from "@/lib/queries";
import { formatDate, resolveAssetUrl } from "@/lib/utils";
import PhotoCard from "@/components/PhotoCard";
import PhotoViewer from "@/components/PhotoViewer";
import PhotoImage from "@/components/PhotoImage";
import DownloadButton from "@/components/DownloadButton";
import { checkArtworkDownloadAccess } from "@/lib/artworkAccess";
import { BiIcon } from "components/BiIcon";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await db
    .select({ photo: photos, category: categories, photographer: users })
    .from(photos)
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .innerJoin(users, eq(photos.photographerId, users.id))
    .where(and(eq(photos.slug, slug), eq(photos.isPublished, true)))
    .limit(1);
  if (!row[0]) return { title: "Photo not found" };

  const photo = row[0].photo;
  const photographer = row[0].photographer;
  const category = row[0].category;

  const title = `${photo.title} · Aperio`;
  const description = photo.description
    ? `${photo.description}. ${photographer?.name || "Aperio photographer"}`
    : `${photographer?.name || "Aperio photographer"} photography`;

  const keywords = [
    photo.title,
    category?.name || "",
    photographer?.name || "",
    "stock photos",
    "fine art prints",
    "photography",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      images: [
        {
          url: resolveAssetUrl(photo.imageUrl),
          width: photo.width ?? 0,
          height: photo.height ?? 0,
          alt: photo.title,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [resolveAssetUrl(photo.imageUrl)],
    },
  };
}

const EXIF_LABELS: Record<string, string> = {
  camera: "Camera",
  lens: "Lens",
  focalLength: "Focal length",
  aperture: "Aperture",
  shutterSpeed: "Shutter",
  iso: "ISO",
  takenAt: "Captured",
};

export default async function PhotoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();

  const row = await db
    .select({ photo: photos, category: categories, photographer: users })
    .from(photos)
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .innerJoin(users, eq(photos.photographerId, users.id))
    .where(and(eq(photos.slug, slug), eq(photos.isPublished, true)))
    .limit(1);

  if (!row[0]) notFound();

  const [withTags, sizes, mounts, myCollections, relatedRows] = await Promise.all([
    attachTags(row),
    fetchPrintSizes(),
    fetchMounts(),
    user ? fetchMyCollections(user.id) : Promise.resolve([]),
    fetchRelated(row[0].photo),
  ]);

  const photo = withTags[0];

  // Vérification Zero Trust pour le bouton Télécharger HD (F12 Clean : booléen seul, pas de path)
  const dlAccess = photo.hasHd && user ? await checkArtworkDownloadAccess(user, photo.id) : { allowed: false as const };
  const canDownloadHd = dlAccess.allowed === true;

  // Increment view count (best effort)
  db.update(photos)
    .set({ views: (row[0].photo.views ?? 0) + 1 })
    .where(eq(photos.id, row[0].photo.id))
    .catch(() => undefined);

  let initialLiked = false;
  let initialCollectionIds: number[] = [];
  if (user) {
    const [likeRows, cpRows] = await Promise.all([
      db
        .select({ id: likes.photoId })
        .from(likes)
        .where(and(eq(likes.userId, user.id), eq(likes.photoId, photo.id))),
      db
        .select({ id: collectionPhotos.collectionId })
        .from(collectionPhotos)
        .innerJoin(collections, eq(collectionPhotos.collectionId, collections.id))
        .where(
          and(
            eq(collectionPhotos.photoId, photo.id),
            eq(collections.userId, user.id),
          ),
        ),
    ]);
    initialLiked = likeRows.length > 0;
    initialCollectionIds = cpRows.map((r) => r.id);
  }

const exif = photo.exif as Record<string, string | number | null> | null;

// JSON-LD Schema.org structured data
const ldBase: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "ImageObject",
  name: photo.title,
  description: photo.description || "",
  url: resolveAssetUrl(photo.imageUrl),
  image: resolveAssetUrl(photo.imageUrl),
  width: photo.width,
  height: photo.height,
  license: photo.licenseType === "limited" ? "https://aperio.com/licenses" : undefined,
  author: {
    "@type": "Organization",
    name: "Aperio",
    url: "https://aperio.com",
  },
};

const ldProduct: Record<string, unknown> = {
  "@type": "Product",
  name: photo.title,
  description: photo.description || "",
  sku: `AP-${photo.id}`,
  brand: {
    "@type": "Organization",
    name: "Aperio",
  },
  offers: {
    "@type": "Offer",
    price: photo.basePrice.toString(),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

  return (
    <div className="container py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...ldBase, ...(photo.licenseType === "limited" ? ldProduct : {}) }, null, 2) }} />
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0" style={{ fontSize: "0.85rem" }}>
          <li className="breadcrumb-item">
            <Link href="/">Home</Link>
          </li>
          <li className="breadcrumb-item">
            <Link href={photo.licenseType === "free" ? "/photos" : "/prints"}>
              {photo.licenseType === "free" ? "Free photos" : "Fine art prints"}
            </Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page" style={{ color: "var(--ap-muted)" }}>
            {photo.title}
          </li>
        </ol>
      </nav>

      <div className="row g-4">
        {/* Image column · intégration fluide sans bande parasite */}
        <div className="col-lg-7">
          <div className="rounded-2xl overflow-hidden" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.06)" }}>
            <PhotoImage src={photo.imageUrl} alt={photo.title} color={photo.color} />
          </div>

          {photo.description && (
            <div className="mt-4 rounded-2xl p-5" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="font-bold mb-3" style={{ color: "#fbbf24", fontFamily: "var(--font-accent)", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>About this work</div>
              <p className="mb-0" style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "#E5E5E5", fontFamily: "var(--font-sans)" }}>
                {photo.description}
              </p>
            </div>
          )}

          {exif && Object.keys(exif).length > 0 && (
            <div className="mt-4">
              <div className="font-bold mb-3" style={{ color: "#fbbf24", fontFamily: "var(--font-accent)", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Shot &amp; equipment</div>
              <div className="exif-grid">
                {Object.entries(exif).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;
                  return (
                    <div className="exif-tile" key={key} style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="k" style={{ color: "#fbbf24" }}>{EXIF_LABELS[key] ?? key}</div>
                      <div className="v" style={{ color: "#FFFFFF" }}>{String(value)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {photo.licenseType === "limited" && (
            <div className="mt-3 limited-note">
              <BiIcon name="bi-patch-check-fill" className="me-2" />
              <strong>Certificate of authenticity included.</strong> Every edition ships with a
              numbered certificate and a verification fingerprint. Verify the work’s
              provenance online on Aperio.
            </div>
          )}
        </div>

        {/* Panel column */}
        <div className="col-lg-5">
          <PhotoViewer
            photo={photo}
            sizes={sizes}
            mounts={mounts}
            initialLiked={initialLiked}
            collections={myCollections}
            initialCollectionIds={initialCollectionIds}
          />
          {/* Téléchargement sécurisé HD — bouton réutilisable Zero Trust */}
          {photo.hasHd && (
            <div className="mt-4 rounded-2xl p-4" style={{ background: "#141416", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 mb-2 font-bold text-sm" style={{ color: "#fbbf24", fontFamily: "var(--font-accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <BiIcon name="bi-download" style={{ color: "#fbbf24" }} />
                Fichier original
              </div>
              {canDownloadHd ? (
                <>
                  <p className="text-sm mb-3" style={{ color: "#E5E5E5" }}>
                    Vous disposez des droits pour cette œuvre. Téléchargement HD via flux sécurisé.
                  </p>
                  <DownloadButton artworkId={photo.id} label="Télécharger l'original HD" variant="gold" size="md" className="w-full" />
                </>
              ) : (
                <>
                  <p className="text-sm mb-3" style={{ color: "#A3A3A3" }}>
                    {user ? "Achetez la licence HD ou une édition pour débloquer le téléchargement." : "Connectez-vous et acquérez la licence HD pour télécharger l'original."}
                  </p>
                  <DownloadButton artworkId={photo.id} label={user ? "Vérifier l'accès HD" : "Se connecter pour télécharger"} variant="dark" size="md" className="w-full" />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Related · titres Playfair sur fond beige */}
      {relatedRows.length > 0 && (
        <section className="mt-8">
          <div className="gallery-label" style={{ fontFamily: "var(--font-accent)", color: "#b45309" }}>In the same collection</div>
          <h2 className="font-serif font-bold mb-4" style={{ fontSize: "1.5rem", color: "#1C1917" }}>
            Similar works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {relatedRows.map((p) => (
              <PhotoCard key={p.id} photo={p} />
            ))}
          </div>
        </section>
      )}

      <div className="text-muted-2 mt-4" style={{ fontSize: "0.8rem" }}>
        Published on {formatDate(photo.createdAt)} · Reference #{photo.id}
      </div>
    </div>
  );
}

async function fetchRelated(photo: (typeof photos.$inferSelect)) {
  if (!photo.categoryId) return [];
  const ids = await db
    .select({ id: photos.id })
    .from(photos)
    .where(
      and(
        eq(photos.categoryId, photo.categoryId),
        eq(photos.licenseType, photo.licenseType),
        ne(photos.id, photo.id),
        eq(photos.isPublished, true),
      ),
    )
    .limit(4);
  if (ids.length === 0) return [];
  return fetchPhotoDtos({ ids: ids.map((r) => r.id) });
}
