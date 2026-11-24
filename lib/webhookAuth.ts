import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Vérification d'authentification des webhooks Mobile Money.
 *
 * Principe Zero-Trust : aucun webhook ne doit pouvoir marquer une commande
 * comme payée sans preuve cryptographique. La signature HMAC-SHA256 porte sur
 * le corps brut et l'horodatage : `${timestamp}.${rawBody}`, avec le secret
 * configuré côté serveur. Un jeton envoyé en clair ne suffit pas.
 *
 * Env supportées (par priorité) :
 *  - ORANGE_MONEY_WEBHOOK_TOKEN / MVOLA_WEBHOOK_TOKEN / AIRTEL_WEBHOOK_TOKEN
 *    (spécifiques par opérateur, prioritaires si définis)
 *  - WEBHOOK_SECRET générique (partagé par tous les opérateurs)
 *
 * Headers requis :
 *  - x-webhook-timestamp : secondes Unix (fenêtre de 5 minutes)
 *  - x-webhook-signature : HMAC-SHA256 hexadécimal du corps brut horodaté
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

export async function verifyWebhookSecret(
  req: NextRequest,
  provider: "orange" | "mvola" | "airtel",
): Promise<{ ok: true } | { ok: false; reason: string; status: 401 | 403 }> {
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

  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  const signature = req.headers.get("x-webhook-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || !signature) {
    return { ok: false, reason: "Signature webhook ou horodatage manquant.", status: 401 };
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
    return { ok: false, reason: "Horodatage webhook hors de la fenêtre autorisée.", status: 401 };
  }

  const rawBody = await req.clone().text();
  const digest = createHmac("sha256", expected).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!timingEqual(signature.toLowerCase(), digest)) {
    return { ok: false, reason: "Signature webhook invalide.", status: 401 };
  }
  return { ok: true };
}
