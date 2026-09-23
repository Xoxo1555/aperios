/**
 * Détection fiable des codes d'erreur Postgres.
 *
 * drizzle encapsule les erreurs du driver `pg` : l'erreur levée est un
 * `DrizzleQueryError` sans `code`, et le SQLSTATE réel se trouve sur sa chaîne
 * `cause` (`DatabaseError`). Un test naïf `(err as { code?: string }).code`
 * ne voit donc JAMAIS le code et rate silencieusement les violations de
 * contrainte. On remonte la chaîne `cause` (profondeur bornée).
 */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && typeof cur === "object" && cur !== null; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

const RETRYABLE_PG_CODES = new Set(["40P01", "40001"]);

/** Interblocage détecté (40P01) ou échec de sérialisation (40001) :
 *  l'opération peut être rejouée sans risque (transaction annulée). */
export function isRetryablePgError(err: unknown): boolean {
  return RETRYABLE_PG_CODES.has(pgErrorCode(err) ?? "");
}

/** Violation d'une contrainte d'unicité (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}
