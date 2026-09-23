/**
 * Répare les photos dont les compteurs d'édition violent la contrainte
 * `photos_edition_bounds` (available_stock > total_editions, ou total_editions
 * NULL alors qu'un stock fini est défini).
 *
 * La migration DDL 0009 ne touche PLUS aux données : elle échoue bruyamment si
 * de telles lignes existent. Il faut donc exécuter ce script d'abord, sur la
 * base cible UNIQUEMENT, puis appliquer 0009.
 *
 * Modes (obligatoire, explicite) :
 *   --mode=cap-stock    available_stock := total_editions
 *                       (respecte le tirage annoncé ; refuse si total NULL)
 *   --mode=raise-total  total_editions := available_stock
 *                       (considère le stock comme la vérité)
 *
 * Ce script REFUSE de toucher une photo qui a déjà des `order_items` ou des
 * `certificates` : réécrire ses compteurs pourrait entrer en collision avec des
 * numéros d'édition déjà émis. Ces lignes sont signalées puis ignorées.
 *
 * Dry-run par défaut. Ajouter --apply pour écrire. Idempotent.
 *
 * Usage :
 *   $env:NODE_PATH='<temp>\opencode'
 *   $env:DATABASE_URL='postgresql://user:pass@localhost:5432/<db>'
 *   npx tsx --conditions react-server scripts/fix-edition-bounds.ts --mode=cap-stock [--apply]
 */
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { certificates, orderItems, photos } from "../db/schema";
import { assertLocalDatabase, NON_LOCAL_FLAG } from "./lib/assert-local-db";

/* Seul script autorisé à cibler une base réelle, et uniquement sur option
 * explicite. L'assertion intervient avant toute requête. */
assertLocalDatabase({ allowNonLocal: process.argv.includes(NON_LOCAL_FLAG) });

type Mode = "cap-stock" | "raise-total";

function parseArgs(argv: string[]): { mode: Mode; apply: boolean } {
  const apply = argv.includes("--apply");
  const raw = argv.find((a) => a.startsWith("--mode="))?.slice("--mode=".length);
  if (raw !== "cap-stock" && raw !== "raise-total") {
    console.error(
      "Usage: npx tsx scripts/fix-edition-bounds.ts --mode=cap-stock|raise-total [--apply]",
    );
    process.exit(2);
  }
  return { mode: raw, apply };
}

const log = (msg: string) => console.log(`[fix-edition-bounds] ${msg}`);

interface Decision {
  id: number;
  total: number | null;
  stock: number;
  action: "UPDATE" | "REFUSED";
  newTotal: number | null;
  newStock: number | null;
  reason: string;
}

async function main() {
  const { mode, apply } = parseArgs(process.argv.slice(2));
  log(`mode=${mode} — ${apply ? "APPLY (écritures activées)" : "DRY-RUN (aucune écriture)"}`);

  const inconsistent = and(
    isNotNull(photos.availableStock),
    or(isNull(photos.totalEditions), sql`${photos.totalEditions} < ${photos.availableStock}`),
  );

  const candidates = await db
    .select({ id: photos.id, total: photos.totalEditions, stock: photos.availableStock })
    .from(photos)
    .where(inconsistent)
    .orderBy(photos.id);

  if (candidates.length === 0) {
    log("Aucune photo incohérente — rien à faire.");
    return;
  }
  log(`${candidates.length} photo(s) incohérente(s) détectée(s).`);

  const decisions: Decision[] = [];
  for (const c of candidates) {
    const stock = c.stock as number;
    const base = { id: c.id, total: c.total, stock };

    const items = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.photoId, c.id));
    const certCount = items.length
      ? (
          await db
            .select({ id: certificates.id })
            .from(certificates)
            .where(inArray(certificates.orderItemId, items.map((i) => i.id)))
        ).length
      : 0;

    if (items.length > 0 || certCount > 0) {
      decisions.push({
        ...base,
        action: "REFUSED",
        newTotal: c.total,
        newStock: stock,
        reason: `${items.length} order_item(s) / ${certCount} certificat(s) existant(s)`,
      });
      continue;
    }
    if (stock < 0) {
      decisions.push({ ...base, action: "REFUSED", newTotal: c.total, newStock: stock, reason: "available_stock négatif" });
      continue;
    }
    if (mode === "cap-stock") {
      if (c.total === null) {
        decisions.push({ ...base, action: "REFUSED", newTotal: null, newStock: stock, reason: "cap-stock impossible : total_editions NULL" });
        continue;
      }
      decisions.push({ ...base, action: "UPDATE", newTotal: c.total, newStock: c.total, reason: "available_stock := total_editions" });
    } else {
      decisions.push({ ...base, action: "UPDATE", newTotal: stock, newStock: stock, reason: "total_editions := available_stock" });
    }
  }

  for (const d of decisions) {
    if (d.action === "UPDATE") {
      log(`  ${d.id}: total ${d.total} → ${d.newTotal}, stock ${d.stock} → ${d.newStock}  [${d.reason}]`);
    } else {
      log(`  ${d.id}: REFUSÉ (total=${d.total}, stock=${d.stock}) — ${d.reason}`);
    }
  }

  const updates = decisions.filter((d) => d.action === "UPDATE");
  const refused = decisions.filter((d) => d.action === "REFUSED");
  log(`Bilan : ${updates.length} mise(s) à jour, ${refused.length} refus.`);

  if (!apply) {
    log("DRY-RUN terminé — relancer avec --apply pour écrire.");
    if (refused.length) process.exitCode = 1;
    return;
  }

  if (updates.length) {
    await db.transaction(async (tx) => {
      for (const d of updates) {
        if (mode === "cap-stock") {
          await tx.update(photos).set({ availableStock: d.newStock }).where(eq(photos.id, d.id));
        } else {
          await tx.update(photos).set({ totalEditions: d.newTotal }).where(eq(photos.id, d.id));
        }
      }
    });
    log(`${updates.length} photo(s) corrigée(s).`);
  }

  const remaining = await db
    .select({ id: photos.id })
    .from(photos)
    .where(inconsistent);
  log(
    `Contrôle post-apply : ${remaining.length} incohérence(s) restante(s)` +
      (remaining.length ? ` (ids: ${remaining.map((r) => r.id).join(", ")})` : "."),
  );
  if (remaining.length || refused.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[fix-edition-bounds] ERREUR :", err);
  process.exitCode = 1;
});
