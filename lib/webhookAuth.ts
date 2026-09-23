import "server-only";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Vérification d'authentification des webhooks Mobile Money.
 *
 * Principe Zero-Trust : aucun webhook ne doit pouvoir marquer une commande
 * comme payée sans preuve cryptographique. On exige un secret partagé
 * configuré côté serveur et envoyé par l'opérateur dans un header.
 *
 * Env supportées (par priorité) :
 *  - WEBHOOK_SECRET générique (recommandé, partagé par tous les opérateurs)
 *  - ORANGE_MONEY_WEBHOOK_TOKEN / MVOLA_WEBHOOK_TOKEN / AIRTEL_WEBHOOK_TOKEN
 *    (spécifiques par opérateur, prioritaires si définis)
 *
 * Headers acceptés :
 *  - x-webhook-token
 *  - x-webhook-secret
 *  - Authorization: Bearer <token>
 *
 * Si aucun secret n'est configuré, la requête est toujours refusée (403) et
 * un avertissement explicite est émis : l'instance est configurée de façon
 * vulnérable et aucun webhook ne peut être authentifié.
 */
function expectedSecret(provider: "orange" | "mvola" | "airtel"): string | undefined {
  const specific =
    provider === "orange"
      ? process.env.ORANGE_MONEY_WEBHOOK_TOKEN
      : provider === "mvola"
        ? process.env.MVOLA_WEBHOOK_TOKEN
        : process.env.AIRTEL_WEBHOOK_TOKEN;
  if (specific) return specific;
  return process.env.WEBHOOK_SECRET;
}

function timingEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyWebhookSecret(
  req: NextRequest,
  provider: "orange" | "mvola" | "airtel",
): { ok: true } | { ok: false; reason: string; status: 401 | 403 } {
  const expected = expectedSecret(provider);
  if (!expected) {
    console.warn(
      `[webhooks/${provider}] WEBHOOK_SECRET non configuré — webhook REFUSÉ (403). Définissez WEBHOOK_SECRET ou ${provider.toUpperCase()}_WEBHOOK_TOKEN.`,
    );
    return {
      ok: false,
      reason: "Aucun jeton webhook configuré côté serveur, requête refusée.",
      status: 403,
    };
  }

  const headerToken =
    req.headers.get("x-webhook-token") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-callback-token") ??
    "";

  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const provided = headerToken || bearerToken;

  if (!provided) {
    return { ok: false, reason: "Jeton webhook manquant (header x-webhook-token ou Authorization Bearer requis).", status: 401 };
  }
  if (!timingEqual(provided, expected)) {
    return { ok: false, reason: "Jeton webhook invalide.", status: 401 };
  }
  return { ok: true };
}
