import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "db";
import { photos, users } from "db/schema";
import { getSessionUser } from "lib/auth";
import { fetchMyCollections, fetchPhotoDtos } from "lib/queries";
import { pool } from "db";
import { resolveAssetUrl } from "lib/utils";
import { LightboxProvider } from "./ProfileLightbox";
import ProfilePageClient from "./ProfilePageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return { title: "Login required" };

  const isCreator = user.role === "photographer" || user.role === "admin";

  const [userFull] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

  if (isCreator && userFull) {
    const title = `${userFull.name || "Photographer"} · Aperio Profile`;
    const description = `${userFull.name || "Photographer"} portfolio on Aperio, featuring fine art photography and limited edition prints`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [
          {
            url: resolveAssetUrl(userFull.avatarUrl || "/images/logo-badge.png"),
            alt: userFull.name || "Photographer",
            width: 400,
            height: 400,
          },
        ],
        locale: "en_US",
        type: "profile",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [resolveAssetUrl(userFull.avatarUrl || "/images/logo-badge.png")],
      },
    };
  }

  return { title: `${user.name || "User"} Profile · Aperio`, description: "User profile on Aperio" };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/profile");

  const isCreator = user.role === "photographer" || user.role === "admin";

  const [userFull] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [myPhotos, collections, stats] = await Promise.all([
    isCreator ? fetchPhotoDtos({ photographerId: user.id, limit: 60 }) : Promise.resolve([]),
    fetchMyCollections(user.id),
    isCreator ? db.select({
      photoCount: sql<number>`count(*)::int`,
      downloads: sql<number>`coalesce(sum(${photos.downloads}),0)::int`,
      likes: sql<number>`coalesce(sum(${photos.likesCount}),0)::int`,
      views: sql<number>`coalesce(sum(${photos.views}),0)::int`,
      featured: sql<number>`count(*) filter (where ${photos.featured})::int`,
    }).from(photos).where(eq(photos.photographerId, user.id))
    : Promise.resolve([null]),
  ]);

  let payouts: {
    id: number;
    reference: string;
    amount: string;
    method: string;
    account_name: string | null;
    status: string;
    created_at: Date;
  }[] = [];
  if (isCreator) {
    try {
      const r = await pool.query(
        "SELECT id, reference, amount::text AS amount, method, account, account_name, status, processed_at, created_at FROM payouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
        [user.id],
      );
      payouts = r.rows ?? [];
    } catch { /* table may not exist yet */ }
  }

  const s = stats[0];

  return (
    <LightboxProvider>
      <ProfilePageClient
        userFull={{
          ...userFull,
          createdAt: userFull.createdAt.toISOString(),
        }}
        stats={s ? {
          photoCount: s.photoCount,
          views: s.views,
          likes: s.likes,
          downloads: s.downloads,
          featured: s.featured,
        } : null}
        payouts={payouts}
        myPhotos={myPhotos}
        collections={collections}
        isCreator={isCreator}
      />
    </LightboxProvider>
  );
}