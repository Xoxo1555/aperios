import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { checkArtworkDownloadAccess } from "lib/artworkAccess";
import { extFromMime, openHdSource } from "lib/upload";
import { photoIdParamSchema } from "lib/validation";
import { slugify } from "lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/artworks/[id]/download
 *
 * Téléchargement sécurisé de l'œuvre originale.
 * Principes Senior :
 *  - Zero Trust : vérifie session + entitlement côté serveur (admin/proprio/entitlement/commande payée)
 *  - Stream : sert le fichier via ReadableStream sans charger tout en RAM
 *  - Headers : Content-Type réel, Content-Disposition attachment, nosniff, no-store
 *  - F12 Clean : jamais de chemin absolu exposé (logs génériques, messages neutres)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth — Zero Trust : aucune confiance côté client
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { id: rawId } = await params;
  const parsed = photoIdParamSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant d'œuvre invalide." }, { status: 400 });
  }
  const artworkId = parsed.data;

  // 2. Entitlement check centralisé (ne révèle pas si l'œuvre existe sans droit)
  const access = await checkArtworkDownloadAccess(user, artworkId);
  if (!access.allowed || !access.photo) {
    // 403 générique — ne divulgue pas hdPath ni existence précise
    return NextResponse.json({ error: access.reason ?? "Accès refusé." }, { status: 403 });
  }

  const photo = access.photo;

  // 3. Source HD : Blob privé ou storage/hd local, résolue côté serveur uniquement
  const source = await openHdSource(photo.hdPath);
  if (!source) {
    console.error(`[artworks/download] source HD indisponible pour artwork ${artworkId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 404 });
  }

  // 4. Headers sécurisés
  const mime = source.mime ?? photo.hdMime ?? "application/octet-stream";
  const ext = extFromMime(mime);
  // slugify titre pour filename safe, sans exposer de données sensibles
  const safeBase = slugify(photo.title) || `aperio-${photo.id}`;
  const filename = `${safeBase}.${ext}`;
  // RFC 5987 pour UTF-8
  const encodedFilename = encodeURIComponent(filename);

  try {
    return new NextResponse(source.stream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(source.size),
        // attachment force le téléchargement navigateur
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, must-revalidate",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    console.error(`[artworks/download] échec stream artwork ${artworkId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }
}
