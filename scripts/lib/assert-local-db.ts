/**
 * Garde-fou commun aux scripts qui écrivent en base (seed, import, réparation,
 * vérifications destructrices). Il lit `DATABASE_URL` et REFUSE de démarrer si :
 *   - la variable est absente ou illisible ;
 *   - `NODE_ENV=production` ;
 *   - l'hôte n'est pas strictement local (localhost, 127.0.0.1, ::1).
 *
 * Le but est d'éviter qu'un `DATABASE_URL` de production pointe accidentellement
 * une base réelle lors d'une commande lancée dans le mauvais shell.
 *
 * Seule exception prévue : `scripts/fix-edition-bounds.ts`, qui peut cibler une
 * base réelle après sauvegarde, via l'option explicite `--i-know-this-is-not-local`
 * passée à `assertLocalDatabase({ allowNonLocal: true })`.
 *
 * Aucune connexion réseau n'est ouverte ici : `process.exit(1)` intervient avant
 * que le pool `pg` ne soit utilisé.
 */

/** Hôtes considérés comme locaux (IPv6 entre crochets incluse). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Option explicite permettant de cibler délibérément une base non locale. */
export const NON_LOCAL_FLAG = "--i-know-this-is-not-local";

export interface AssertLocalDatabaseOptions {
  /** Désactive la garde (hôte non local et NODE_ENV=production) — usage manuel conscient. */
  allowNonLocal?: boolean;
}

function refuse(message: string): never {
  console.error(`[assert-local-db] REFUS : ${message}`);
  process.exit(1);
}

/**
 * Vérifie que `DATABASE_URL` cible une base locale et que NODE_ENV n'est pas
 * `production`. En cas de refus : message clair sur stderr puis `exit(1)`.
 */
export function assertLocalDatabase(opts: AssertLocalDatabaseOptions = {}): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    refuse("DATABASE_URL est absent : impossible de garantir que la cible est locale.");
  }

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    refuse("DATABASE_URL n'est pas une URL valide.");
  }

  const isLocal = LOCAL_HOSTS.has(host) || host.endsWith(".localhost");

  if (process.env.NODE_ENV === "production" && !opts.allowNonLocal) {
    refuse("NODE_ENV=production : ce script refuse de s'exécuter (base potentiellement réelle).");
  }

  if (!isLocal && !opts.allowNonLocal) {
    refuse(
      `l'hôte « ${host} » n'est pas local (attendu : localhost, 127.0.0.1 ou ::1). ` +
        `Pour cibler volontairement une base réelle sauvegardée, ` +
        `fix-edition-bounds.ts accepte l'option ${NON_LOCAL_FLAG}.`,
    );
  }

  if (!isLocal && opts.allowNonLocal) {
    console.warn(
      `[assert-local-db] ATTENTION : garde désactivée via ${NON_LOCAL_FLAG} → cible « ${host} ».`,
    );
  }
}
