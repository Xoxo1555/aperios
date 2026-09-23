/**
 * Verification automatique des images Aperio
 * ------------------------------------------------------------------
 * 1. Scanne scripts/seed.ts et tout le dossier src (fichiers TS/TSX)
 *    a la recherche de chemins /images/... et confirme que chaque
 *    fichier existe sur le disque a l'emplacement exact public/images/
 * 2. (optionnel, apres seed) Interroge la base de donnees et verifie
 *    que chaque image_url / thumb_url des photos est un fichier reel.
 *
 * Usage :  npx tsx scripts/verify-images.ts
 * Sortie : liste detaillee OK/FAIL + resume. Code 0 = 100% OK.
 */
import "dotenv/config";
import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";
import { pool } from "../db";
import { assertLocalDatabase } from "./lib/assert-local-db";

/* Refuse une cible non locale AVANT toute connexion. */
assertLocalDatabase();

const ROOT = process.cwd();

function findAllImages(root: string, exts: string[]): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

function checkFileOnDisk(webPath: string): { ok: boolean; size: number } {
  const abs = join(ROOT, "public", webPath.replace(/^\/images/, "images"));
  if (!existsSync(abs)) return { ok: false, size: 0 };
  return { ok: true, size: statSync(abs).size };
}

async function main() {
  const seen = new Map<string, { ok: boolean; size: number; refs: string[] }>();
  const addRef = (webPath: string, ref: string) => {
    const cur = seen.get(webPath) ?? { ok: true, size: 0, refs: [] };
    cur.refs.push(ref);
    const { ok, size } = checkFileOnDisk(webPath);
    cur.ok = ok;
    cur.size = size;
    seen.set(webPath, cur);
  };

  /* ---- 1. Scan du code ---- */
  const files = [
    ...findAllImages(ROOT, [".ts", ".tsx"]),
    join(ROOT, "scripts", "seed.ts"),
  ];
  const re = /\/images\/[\w\-./]+\.(?:jpg|jpeg|png|webp|svg)/g;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.match(re) ?? []) {
      addRef(match, relative(ROOT, file));
    }
  }

  /* ---- 2. Scan de la base de donnees ---- */
  let dbRows: string[] = [];
  try {
    const r = await pool.query(
      "SELECT image_url AS url FROM photos UNION SELECT thumb_url AS url FROM photos WHERE thumb_url IS NOT NULL",
    );
    dbRows = (r.rows as Array<{ url: string }>)
      .map((row) => row.url)
      .filter((url) => url && url.startsWith("/images/"));
  } catch {
    console.log("ATTENTION: base de donnees non accessible - verification DB ignoree.");
  }

  for (const url of dbRows) addRef(url, "base de donnees (photos.image_url / thumb_url)");

  /* ---- 3. Rapport ---- */
  let fail = 0;
  const paths = [...seen.keys()].sort();
  console.log(`\n=== RAPPORT DE VERIFICATION - ${paths.length} chemins uniques ===\n`);
  for (const p of paths) {
    const s = seen.get(p)!;
    if (s.ok) {
      console.log(`OK   ${p.padEnd(50)} ${(s.size / 1024).toFixed(0).padStart(6)} Ko  (${s.refs.length} reference(s))`);
    } else {
      fail++;
      console.log(`FAIL ${p.padEnd(50)} MANQUANT  (refs: ${s.refs.join(", ")})`);
    }
  }

  console.log(`\n=== RESUME ===`);
  console.log(`Chemins references  : ${paths.length}`);
  console.log(`Fichiers presents   : ${paths.length - fail}`);
  console.log(`Fichiers manquants  : ${fail}`);
  if (dbRows.length > 0) console.log(`URLs en base verifiees : ${dbRows.length}`);

  if (fail === 0) {
    console.log("\nOK: 100% DES IMAGES REFERENCEES EXISTENT SUR LE DISQUE - AUCUNE IMAGE CASSEE");
  } else {
    console.log("\nFAIL: DES IMAGES SONT MANQUANTES - CORRECTION REQUISE AVANT LIVRAISON");
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
