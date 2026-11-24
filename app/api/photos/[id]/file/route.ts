import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "lib/auth";
import { checkArtworkDownloadAccess } from "lib/artworkAccess";
import { extFromMime, openHdSource } from "lib/upload";
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

  const source = await openHdSource(photo.hdPath);
  if (!source) {
    console.error(`[photos/file] source HD indisponible pour photo ${photoId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 404 });
  }

  const mime = source.mime ?? photo.hdMime ?? "application/octet-stream";
  const ext = extFromMime(mime);
  const safeBase = slugify(photo.title) || `aperio-${photo.id}`;
  const filename = `${safeBase}.${ext}`;
  const encodedFilename = encodeURIComponent(filename);

  try {
    return new NextResponse(source.stream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(source.size),
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