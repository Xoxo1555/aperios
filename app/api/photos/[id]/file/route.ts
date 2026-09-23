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
 * GET /api/photos/[id]/file — serves the original high-resolution source of a
 * photo. The HD source is stored OUTSIDE of /public (never a static URL) and
 * is only streamed to:
 *   - the owning photographer,
 *   - an administrator,
 *   - a buyer who actually purchased this photo (paid order item).
 * Everything else gets 401/403.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { id: rawId } = await params;
  const parsed = photoIdParamSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de photo invalide." }, { status: 400 });
  }
  const photoId = parsed.data;

  const access = await checkArtworkDownloadAccess(user, photoId);
  if (!access.allowed || !access.photo) {
    return NextResponse.json({ error: access.reason ?? "Accès refusé." }, { status: 403 });
  }
  const photo = access.photo;

  let absPath: string;
  try {
    absPath = resolveHdPath(photo.hdPath);
  } catch {
    console.error(`[photos/file] chemin invalide pour photo ${photoId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }

  let fileSize: number;
  try {
    const s = await stat(absPath);
    if (!s.isFile()) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    fileSize = s.size;
  } catch {
    console.error(`[photos/file] fichier manquant photo ${photoId}`);
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const mime = photo.hdMime ?? "application/octet-stream";
  const ext = extFromMime(mime);
  const safeBase = slugify(photo.title) || `aperio-${photo.id}`;
  const filename = `${safeBase}.${ext}`;
  const encodedFilename = encodeURIComponent(filename);

  try {
    const nodeStream = createReadStream(absPath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
    nodeStream.on("error", () => console.error(`[photos/file] erreur stream photo ${photoId}`));
    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileSize),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, must-revalidate",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    console.error(`[photos/file] échec stream photo ${photoId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }
}