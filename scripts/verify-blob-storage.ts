import assert from "node:assert/strict";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  deleteStoredFile,
  isBlobMode,
  isPrivateBlobPath,
  isPublicBlobUrl,
  resolveHdPath,
} from "../lib/upload";

const tokenBefore = process.env.BLOB_READ_WRITE_TOKEN;

async function main() {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.equal(isBlobMode(), false, "sans token, le stockage disque reste actif");

  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  assert.equal(isBlobMode(), true, "avec token, le stockage Blob est actif");
  delete process.env.BLOB_READ_WRITE_TOKEN;

  assert.equal(
    isPublicBlobUrl("https://store.public.blob.vercel-storage.com/avatars/a.jpg"),
    true,
    "une URL Blob publique est reconnue",
  );
  assert.equal(
    isPublicBlobUrl("https://store.private.blob.vercel-storage.com/hd/a.jpg"),
    false,
    "une URL Blob privée n'est pas un visuel public",
  );
  assert.equal(
    isPublicBlobUrl("https://evil.example/blob/a.jpg"),
    false,
    "une URL externe n'est pas traitée comme un Blob",
  );

  assert.equal(isPrivateBlobPath("hd/2026/a.jpg"), true, "un chemin HD Blob est reconnu");
  assert.equal(isPrivateBlobPath("2026/a.jpg"), false, "un chemin HD local reste local");

  assert.throws(
    () => resolveHdPath("../../secret.jpg"),
    /Chemin HD invalide/,
    "le chemin HD local reste protégé contre la traversée",
  );

  const dir = join(process.cwd(), "public", "uploads", "avatars");
  const file = join(dir, `verify-blob-${Date.now()}.jpg`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, "x");
  try {
    await deleteStoredFile(`/uploads/avatars/${basename(file)}`);
    assert.equal(existsSync(file), false, "un visuel local supprimé disparaît du disque");
  } finally {
    await unlink(file).catch(() => undefined);
  }

  console.log("verify-blob-storage: PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (tokenBefore === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = tokenBefore;
  });
