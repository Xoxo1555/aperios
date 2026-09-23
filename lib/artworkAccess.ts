import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "db";
import { entitlements, orderItems, orders, photos } from "db/schema";
import { isAdmin } from "./rbac";
import type { SessionUser } from "./types";

/**
 * Centralise la logique Zero Trust de téléchargement HD.
 * Réutilisé par /api/photos/[id]/file et /api/artworks/[id]/download.
 * Ne jamais faire confiance au client — tout est re-vérifié côté serveur.
 */
export interface ArtworkAccessResult {
  allowed: boolean;
  reason?: string;
  photo?: {
    id: number;
    title: string;
    hdPath: string;
    hdMime: string | null;
    hdSize: number | null;
    photographerId: number;
  };
}

export async function checkArtworkDownloadAccess(
  user: SessionUser | null,
  photoId: number,
): Promise<ArtworkAccessResult> {
  if (!user) {
    return { allowed: false, reason: "Authentification requise." };
  }

  const [photo] = await db
    .select({
      id: photos.id,
      title: photos.title,
      hdPath: photos.hdPath,
      hdMime: photos.hdMime,
      hdSize: photos.hdSize,
      photographerId: photos.photographerId,
    })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);

  if (!photo || !photo.hdPath) {
    return { allowed: false, reason: "Fichier haute définition introuvable." };
  }

  // Après le guard, hdPath est garanti string
  const safePhoto = {
    id: photo.id,
    title: photo.title,
    hdPath: photo.hdPath as string,
    hdMime: photo.hdMime,
    hdSize: photo.hdSize,
    photographerId: photo.photographerId,
  } satisfies NonNullable<ArtworkAccessResult["photo"]>;

  // Admin ou propriétaire : accès immédiat
  if (isAdmin(user) || photo.photographerId === user.id) {
    return { allowed: true, photo: safePhoto };
  }

  // Licence numérique (entitlements) — achat HD "personal"/"commercial"
  const [entitlement] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, user.id), eq(entitlements.photoId, photoId)))
    .limit(1);

  if (entitlement) {
    return { allowed: true, photo: safePhoto };
  }

  // Commande print payée (paid/shipped/delivered/completed) contenant la photo
  const paid = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        inArray(orders.status, ["paid", "shipped", "delivered", "completed"]),
        eq(orderItems.photoId, photoId),
        eq(orders.userId, user.id),
      ),
    )
    .limit(1);

  if (paid.length > 0) {
    return { allowed: true, photo: safePhoto };
  }

  return { allowed: false, reason: "Accès refusé. Achat ou licence HD requis.", photo: safePhoto };
}
