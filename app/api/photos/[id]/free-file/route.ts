import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { and, eq, sql } from "drizzle-orm";
import { normalize, join, extname } from "path";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { photoIdParamSchema } from "lib/validation";
import { slugify } from "lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/photos/[id]/free-file — téléchargement public des photos libres.
 * Réservé aux photos `licenseType="free"` publiées (contenu déjà public :
 * l'image est affichée partout sans authentification).
 *
 * Sert le fichier avec `Content-Disposition: attachment` → vrai téléchargement
 * navigateur (barre de progression, nom de fichier, pas de visionnage inline).
 * Les URLs relatives (uploads Aperio) sont streamées depuis /public ; les URLs
 * absolues (photos importées, ex. Unsplash) sont récupérées côté serveur puis
 * re-streamées en pièce jointe, pour ne jamais renvoyer une URL ouvrable.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const parsed = photoIdParamSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de photo invalide." }, { status: 400 });
  }
  const photoId = parsed.data;

  const [photo] = await db
    .select({ title: photos.title, imageUrl: photos.imageUrl, licenseType: photos.licenseType, isPublished: photos.isPublished })
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.isPublished, true)))
    .limit(1);

  if (!photo || photo.licenseType !== "free") {
    return NextResponse.json({ error: "Téléchargement indisponible." }, { status: 404 });
  }

// Comptage best-effort (parité avec l'action "download" existante)
  db.update(photos)
    .set({ downloads: sql`${photos.downloads} + 1` })
    .where(eq(photos.id, photoId))
    .catch(() => undefined);

  const safeBase = slugify(photo.title) || `aperio-${photoId}`;

  // --- Cas URL absolue (photo importée) : récupération + re-stream en pièce jointe
  if (/^https?:\/\//i.test(photo.imageUrl)) {
    try {
      const remote = await fetch(photo.imageUrl);
      if (!remote.ok || !remote.body) {
        return NextResponse.json({ error: "Fichier indisponible." }, { status: 502 });
      }
      const buf = Buffer.from(await remote.arrayBuffer());
      const remoteMime = remote.headers.get("content-type") ?? "image/jpeg";
      const ext = remoteMime.split(";")[0].split("/")[1] ?? "jpg";
      const filename = `${safeBase}.${ext}`;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": remoteMime,
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store, must-revalidate",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    } catch {
      return NextResponse.json({ error: "Fichier indisponible." }, { status: 502 });
    }
  }

  // --- Cas URL relative Aperio (/uploads/...) : stream depuis /public
  const publicRoot = normalize(join(process.cwd(), "public"));
  const absolute = normalize(join(publicRoot, photo.imageUrl.replace(/^\/+/g, "")));
  if (!absolute.startsWith(publicRoot)) {
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 404 });
  }

  let fileSize: number;
  try {
    const s = await stat(absolute);
    if (!s.isFile()) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    fileSize = s.size;
  } catch {
    console.error(`[photos/free-file] fichier manquant photo ${photoId}`);
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const ext = extname(absolute).replace(".", "").toLowerCase() || "jpg";
  const mime =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const filename = `${safeBase}.${ext}`;

  try {
    const nodeStream = createReadStream(absolute);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
    nodeStream.on("error", () => console.error(`[photos/free-file] erreur stream photo ${photoId}`));
    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(fileSize),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, must-revalidate",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    console.error(`[photos/free-file] échec stream photo ${photoId}`);
    return NextResponse.json({ error: "Fichier indisponible." }, { status: 500 });
  }
}