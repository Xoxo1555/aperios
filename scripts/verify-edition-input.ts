/**
 * Vérification HTTP (serveur réel sur http://localhost:3000) des DEUX seules
 * routes qui écrivent `total_editions` / `available_stock` :
 *
 *   - POST /api/uploads  (JSON, route "marketplace")
 *   - POST /api/upload   (multipart, route "studio")
 *
 * Objectif : prouver que tout cas invalide est rejeté par la validation zod
 * (HTTP 400 avec message explicite) et JAMAIS par le CHECK Postgres
 * `photos_edition_bounds` (qui produirait un 500). Le stock est toujours
 * DÉRIVÉ de totalEditions par ces routes, donc « stock > total » est
 * structurellement impossible ; on teste donc les entrées invalides qui
 * pourraient l'engendrer (total absent pour une licence limitée, total 0,
 * négatif, non entier, hors bornes, non numérique).
 *
 * Aucune écriture durable : tous les cas testés échouent AVANT l'insertion.
 * On vérifie malgré tout qu'aucune photo marquée n'existe après coup et on la
 * supprime par sécurité dans le `finally`.
 *
 * Usage :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/app_db'
 *   npx tsx --conditions react-server scripts/verify-edition-input.ts
 */
import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { photos, photoTags, tags } from "../db/schema";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion. */
assertLocalDatabase();

const BASE = process.env.APERIO_BASE_URL ?? "http://localhost:3000";
const EMAIL = "photographer@aperio.gallery";
const PASSWORD = "photo123";
const MARKER = `verify-edition-${Date.now().toString(36)}`;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}
const log = (msg: string) => console.log(`[verify-edition-input] ${msg}`);

/** Joli résumé d'une réponse d'erreur. */
function summary(status: number, data: unknown): string {
  const err = (data as { error?: string } | null)?.error;
  return `HTTP ${status}${err ? ` — "${err}"` : ""}`;
}

async function postJson(path: string, body: unknown, cookie: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function postMultipart(
  path: string,
  fields: Record<string, string>,
  cookie: string,
  withFile: boolean,
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (withFile) {
    /* Octets factices : le MIME (header) suffit à passer la 1re barrière ;
     * les cas « total invalide » échouent au zod AVANT le sniff sharp. */
    fd.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "verify.jpg", { type: "image/jpeg" }));
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function markerPhotoCount() {
  const rows = await db
    .select({ id: photos.id })
    .from(photos)
    .where(like(photos.title, `${MARKER}%`));
  return rows.length;
}

/** Attrape une assertion de statut 400 pour un cas invalide donné. */
async function expect400(label: string, run: () => Promise<{ status: number; data: unknown }>) {
  const r = await run();
  check(r.status === 400, `${label} → attendu 400, reçu ${summary(r.status, r.data)}`);
  const err = (r.data as { error?: string }).error ?? "";
  check(err.trim().length > 0, `${label} → message d'erreur non vide`);
  log(`  OK — ${label} → 400 "${err}"`);
  return err;
}

async function main() {
  const cookie = await (async () => {
    const login = await fetch(`${BASE}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: EMAIL, password: PASSWORD }),
    });
    check(login.status === 200, `login créateur démo (${login.status})`);
    const cookies = login.headers.getSetCookie?.() ?? [];
    const c = cookies.map((x) => x.split(";")[0]).join("; ");
    check(c.includes("aperio_session"), "cookie aperio_session reçu");
    return c;
  })();

  const photosBefore = (await db.select({ id: photos.id }).from(photos)).length;
  const tagsBefore = (await db.select({ id: tags.id }).from(tags)).length;
  let photoTagsBefore = -1;
  try {
    photoTagsBefore = (await db.select({ photoId: photoTags.photoId }).from(photoTags)).length;
  } catch {
    /* table optionnelle selon l'état de la base */
  }
  log(`AVANT — photos=${photosBefore}, tags=${tagsBefore}, photo_tags=${photoTagsBefore}, marqueur=${await markerPhotoCount()}`);

  try {
    /* ============================================================= */
    /*  Route 1 — POST /api/uploads (JSON)                            */
    /* ============================================================= */
    log("Route POST /api/uploads — validations zod");

    const base = { title: `${MARKER} json`, licenseType: "limited" };

    await expect400("uploads · totalEditions=0", () =>
      postJson("/api/uploads", { ...base, totalEditions: 0 }, cookie));
    await expect400("uploads · totalEditions=-3", () =>
      postJson("/api/uploads", { ...base, totalEditions: -3 }, cookie));
    await expect400("uploads · totalEditions=1.5", () =>
      postJson("/api/uploads", { ...base, totalEditions: 1.5 }, cookie));
    await expect400("uploads · totalEditions=100001", () =>
      postJson("/api/uploads", { ...base, totalEditions: 100001 }, cookie));
    await expect400("uploads · totalEditions='abc'", () =>
      postJson("/api/uploads", { ...base, totalEditions: "abc" }, cookie));

    /* Preuve que le zod laisse passer un total VALIDE et que l'échec
     * ultérieur (image manquante) reste un 400 — donc aucun CHECK atteint. */
    {
      const r = await postJson("/api/uploads", { ...base, totalEditions: 10 }, cookie);
      check(r.status === 400, `uploads · total=10 sans image → 400 sans écriture (reçu ${summary(r.status, r.data)})`);
      check(/image/i.test((r.data as { error?: string }).error ?? ""), "uploads · message explicite sur l'image manquante");
      log(`  OK — uploads · total=10 (valide) + image absente → 400 "${(r.data as { error?: string }).error}" (aucune insertion)`);
    }

    /* ============================================================= */
    /*  Route 2 — POST /api/upload (multipart)                        */
    /* ============================================================= */
    log("Route POST /api/upload — validations zod (multipart)");

    const formBase = { licenseType: "limited", title: `${MARKER} multi` };

    await expect400("upload · totalEditions=0", () =>
      postMultipart("/api/upload", { ...formBase, totalEditions: "0" }, cookie, true));
    await expect400("upload · totalEditions=100001", () =>
      postMultipart("/api/upload", { ...formBase, totalEditions: "100001" }, cookie, true));
    await expect400("upload · totalEditions='abc'", () =>
      postMultipart("/api/upload", { ...formBase, totalEditions: "abc" }, cookie, true));
    await expect400("upload · totalEditions=1.5", () =>
      postMultipart("/api/upload", { ...formBase, totalEditions: "1.5" }, cookie, true));

    /* Cas clé demandé : total ABSENT pour une licence limitée → zod
     * superRefine, message explicite, jamais le CHECK. */
    await expect400("upload · limited SANS totalEditions", () =>
      postMultipart("/api/upload", { ...formBase }, cookie, true));

    /* Cas limite : fichier présent mais octets non décodables → 415/400,
     * jamais 500, et aucune insertion. */
    {
      const r = await postMultipart("/api/upload", { licenseType: "free", title: `${MARKER} free` }, cookie, true);
      check(r.status === 415 || r.status === 400, `upload · free + octets invalides → 415/400 (reçu ${summary(r.status, r.data)})`);
      log(`  OK — upload · free sans total (valide) + octets invalides → ${r.status} "${(r.data as { error?: string }).error}" (aucune insertion)`);
    }

    /* Sans fichier du tout → 400 "File is required". */
    await expect400("upload · aucun fichier", () =>
      postMultipart("/api/upload", { ...formBase, totalEditions: "10" }, cookie, false));

    /* ============================================================= */
    /*  Intégrité : aucune écriture durable                            */
    /* ============================================================= */
    const photosAfter = (await db.select({ id: photos.id }).from(photos)).length;
    const tagsAfter = (await db.select({ id: tags.id }).from(tags)).length;
    const markerAfter = await markerPhotoCount();
    check(markerAfter === 0, `aucune photo marquée créée (${markerAfter})`);
    check(photosAfter === photosBefore, `nombre de photos inchangé (${photosBefore} → ${photosAfter})`);
    check(tagsAfter === tagsBefore, `nombre de tags inchangé (${tagsBefore} → ${tagsAfter})`);
    log(`APRÈS — photos=${photosAfter}, tags=${tagsAfter}, marqueur=${markerAfter}`);
    log("OK — tous les cas invalides rejetés en 400 par zod, aucun 500, aucune écriture durable.");

    log(`RÉSULTAT : ${failures} échec(s) — TOUS LES TESTS PASSENT`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    /* Sécurité : si une insertion avait fuité, on la retire. */
    const leaked = await db.select({ id: photos.id }).from(photos).where(like(photos.title, `${MARKER}%`));
    for (const p of leaked) {
      await db.delete(photoTags).where(eq(photoTags.photoId, p.id)).catch(() => {});
      await db.delete(photos).where(and(eq(photos.id, p.id))).catch(() => {});
    }
    const remaining = await markerPhotoCount();
    log(`Nettoyage — photos marquées supprimées=${leaked.length}, restantes=${remaining}`);
    if (remaining !== 0) {
      failures++;
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error("[verify-edition-input] ERREUR :", err);
  process.exitCode = 1;
});
