import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { getSessionUser } from "lib/auth";
import { checkArtworkDownloadAccess } from "lib/artworkAccess";
import { resolveHdPath, extFromMime } from "lib/upload";
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

  // 3. Résolution sécurisée du chemin privé (anti traversal)
  let absPath: string;
  try {
    absPath = resolveHdPath(photo.hdPath);
  } catch {
    // Ne jamais logger le chemin absolu — log générique côté serveur uniquement
    console.error(`[artworks/download] chemin invalide pour artwork ${artworkId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }

  // 4. Stat + stream
  let fileSize: number;
  try {
    const s = await stat(absPath);
    if (!s.isFile()) {
      return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    }
    fileSize = s.size;
  } catch {
    console.error(`[artworks/download] fichier manquant artwork ${artworkId}`);
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  // 5. Headers sécurisés
  const mime = photo.hdMime ?? "application/octet-stream";
  const ext = extFromMime(mime);
  // slugify titre pour filename safe, sans exposer de données sensibles
  const safeBase = slugify(photo.title) || `aperio-${photo.id}`;
  const filename = `${safeBase}.${ext}`;
  // RFC 5987 pour UTF-8
  const encodedFilename = encodeURIComponent(filename);

  try {
    const nodeStream = createReadStream(absPath);
    // Conversion Node Readable -> Web ReadableStream pour NextResponse
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    // Gestion d'erreur stream sans fuite de path
    nodeStream.on("error", () => {
      console.error(`[artworks/download] erreur stream artwork ${artworkId}`);
    });

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileSize),
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
