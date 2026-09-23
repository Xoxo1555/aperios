# Rapport I6 — Étape 2 clôturée, Étape 3 (Mobile Money) implémentée et vérifiée

**Date** : 20/09/2026 — **Projet** : D:\Aperio — **Environnement** : win32, PS 5.1, Next 16.2.6 (Turbopack), PostgreSQL `app_db`.
**Serveur de dev** : jamais arrêté ni démarré par les tests (le serveur actif localhost:3000 a été utilisé uniquement par `verify-idempotency`, en lecture/écriture sur un compte démo).

---

## 1. Résultats des 3 scripts de vérification (captures finales, réencodage UTF-8 PS5.1)

| Script | Résultat | Lignes « OK — » | Cleanup |
|---|---|---|---|
| `verify-webhooks.ts` | **0 échec — TOUS LES TESTS PASSENT** | 52 | comptage identique avant/après, aucun résidu |
| `verify-finalize.ts` | **0 échec — TOUS LES TESTS PASSENT** | 14 | comptage identique avant/après, aucun résidu |
| `verify-idempotency.ts` | **0 échec — TOUS LES TESTS PASSENT** | 11 | « État restauré à l'identique — aucune donnée résiduelle » |

Logs : `verify-webhooks-FINAL4.log`, `verify-finalize-FINAL3.log`, `verify-idempotency-FINAL4.log`, `build-I6-FINAL2.log` (temp opencode, UTF-8).

Lignes finales (verbatim) :

```
[verify-webhooks] RÉSULTAT : 0 échec(s) — TOUS LES TESTS PASSENT. Refund API réels: 0; refund simulés via fake: 5.
[verify-webhooks] APRÈS — orders=0, certs=0, oi=0, wt=0, wh=0
[verify-webhooks] RÉSEAU : aucune requête externe émise — stub réseau intact.

[verify-finalize] RÉSULTAT : 0 échec(s) — TOUS LES TESTS PASSENT
[verify-finalize] APRÈS — orders=0, certificates=0, order_items=0, entitlements=0, wallet_transactions=0

[verify-idempotency] RÉSULTAT : 0 échec(s) — TOUS LES TESTS PASSENT
[verify-idempotency] APRÈS — buyer=0.00, photog=0.00, stock=30, orders=0, certs=0, oi=0, wt=0
[verify-idempotency] État restauré à l'identique — aucune donnée résiduelle.
```

> Note : le premier run d'`verify-idempotency` avait échoué sur sa seule assertion finale de restauration — cause : **course de parallélisme** (lancé simultanément avec `verify-finalize`, son comptage AVANT a capturé les lignes transitoires de l'autre script). Rejoué séquentiellement : exit 0, état restauré. Aucune donnée réelle n'a été touchée (les commandes créées portent des `Idempotency-Key` `randomUUID` propres au script ; le nettoyage ne supprime que par ces clés).

## 2. Épreuves d'étape 3 dans `verify-webhooks.ts` (blocs T / U / V / W / X)

Extraits « OK — » (verbatim, épreuves réelles exercées via les VRAIS handlers de production) :

```
T — solde vendeur NÉGATIF -24.92 € : lectures 200, payout 400, wallet 402, vente nette 15.00
  OK — wallet : OrderError 402, solde intact, commande toujours pending
  OK — dashboard : availableBalance=-24.92, label="-24,92 €"
  OK — /api/me → 200 (user=verify-wh-photog-…@aperio.test)
  OK — nouvelle vente créditée : -24.92 + 39.92 = 15.00

U — commande DIGITALE : entitlement + download 200 ; charge.refunded → download 403, clawback UNIQUE
  OK — digital finalized, entitlement actif, download 200 (fichier HD réel)
  OK — refund digital : entitlement supprimé, download 403 (licence révoquée)
  OK — rejeu du refund : aucun double effet (UNE RFD, solde stable)

V — charge.refunded CUMULÉ : partiel → paid CONSERVÉ ; total → refunded avec clawback unique
  OK — partiel (2000/4990) : paid conservé, aucun clawback, vente intacte
  OK — cumul total (4990/4990) : refunded, clawback UNIQUE de 39.92
  OK — rejeu du cumul total : aucun double effet

W — POST /api/admin/orders/[orderNumber]/retry-refund : 401/403, refund unique, 422 inéligible, 409 sans ref
  OK — retry éligible : refunded via fake (Δrefund=1), double → already-refunded (Δ=0)
  OK — amount_mismatch → 422 REFUND_REASON_NOT_ELIGIBLE (remboursement opérateur manuel)
  OK — sans paymentRef (refund_pending d'un paiement opérateur) → 409 MISSING_PAYMENT_REF

X — ÉTAPE 3 Mobile Money : échec → cancelled, succès tardif → refund_pending, JAMAIS d'annulation après paiement
  OK — Orange : FAILED → cancelled (replay no-op), SUCCESS tardif → refund_pending, Δrefund=0
  OK — Orange : échec après paiement → audit, 200, vente jamais annulée
  OK — MVola : failed → cancelled, completed tardif → refund_pending(order_cancelled_after_payment)
  OK — MVola : statut transitoire pending → 200, aucun effet
  OK — Airtel : TF → cancelled, TS tardif → refund_pending(order_cancelled_after_payment)
  OK — Échec opérateur sur dépôt WLD : failed, aucun crédit, event processed
```

Alertes admin générées (prouvent `sendAdminAlert` déclenché à chaque succès tardif / contradiction) :
- « Commande APR-…-946251 : paiement orange-money reçu APRÈS annulation … refund_pending (order_cancelled_after_payment) » (idem mvola/airtel).
- « Contradiction de paiement orange-money … statut déjà « paid ». La vente n'est PAS annulée ».
- « Commande APR-…-638795 remboursée — reprise des soldes … entitlements supprimés : 1 ».
- « Remboursement partiel Stripe détecté … Statut de la commande CONSERVÉ ».

## 3. Implémentation Étape 3

- **`lib/orders.ts`** — nouveau helper `markOrderRefundPendingAfterCancellation(orderNumber, reason, paymentRef?)` : flip **gardé** `cancelled → refund_pending` (aucune finalisation possible sur un ordre non-pending → jamais de re-crédit), `paymentRef` coalesce.
- **`lib/mobile-money-confirm.ts`** — `statusKind: "success" | "failure" | "other"` et sortie `{ status, action }` :
  - échec définitif sur **pending** → `cancelled`, aucun crédit, aucun remboursement ;
  - échec définitif sur **payé/remboursé** → audit + alerte, **200, la vente n'est JAMAIS annulée** ;
  - échec sur **annulée** → no-op (replay) ;
  - succès **tardif** (arrive sur une commande déjà annulée) → `order_cancelled_after_payment` + alerte + remboursement opérateur manuel (skipRefund) ;
  - statut **transitoire** → audit seul, 200 ;
  - **dépôt WLD échoué** → `failWalletDeposit` (pending→failed), aucun crédit ;
  - dédup `webhook_events` conservée en tête (replay → 200 no-op).
- **3 routes webhooks** (`orange-money`, `mvola`, `airtel-money`) — classification des statuts en success/failure/other (jeux d'échec par opérateur), réponse `{ received: true, action }`.
- **Nouvelle route** `app/api/admin/orders/[orderNumber]/retry-refund/route.ts` : 401 sans session, 403 non-admin, 404 inconnue, 409 si pas `refund_pending` / pas de `paymentRef`, 422 si raison inéligible (`amount_mismatch`/`currency_mismatch`, remboursement opérateur manuel), 200 `refunded`/`already-refunded` via `refundOrderToRefunded` (idempotency `refund-<orderNumber>`, jamais double), 502 sur échec d'API.

## 4. Build final

```
npm run build → exit 0 (TypeScript 0 erreur)
Route (app) : 78 entrées — 77 ƒ (dynamique) + 1 ○ (statique)
  ├ ƒ /api/admin/orders/[orderNumber]/retry-refund   ← nouvelle route présente
  ├ ƒ /api/checkout/mobile-money
GET http://localhost:3000/api/health → {"ok":true} (après build)
```

## 5. Étape 2 — Preuves build + routes + diff (objets livrés A1/A2)

- **A1** : `npm run build` exit 0 (Next 16.2.6 Turbopack, TS 0) ; **77 routes** après build ; `/` ƒ, `/photos` ƒ, `/robots.txt` ○ ; health avant et après build = 200 `{"ok":true}`.
- **A2 (diff routes)** : **0 nouvelle route** — manifestes backup/actuel identiques (78 clés), 74 `route.ts`/`page.tsx` = 74, 0 ajout / 0 suppression ; **22 fichiers modifiés** en contenu.
  - Limite : `D:\Aperio_avant_I6` **n'existe pas** (aucun instantané propre du dépôt) — méthode alternative utilisée (manifests de routes + horodatages) ; `D:\Aperios-backup` n'est pas un instantané fiable.

## 6. Audit UI — solde vendeur négatif (README, NON corrigé)

- `formatPrice` / `formatInCurrency` (Intl fr-FR) affichent correctement `-24,92 €`.
- Dashboard : `stats.availableBalance` **nombre** + `availableBalanceLabel` déjà formaté côté serveur → OK (`-24,92 €`).
- Profil : lit la base directement (`userFull`) → OK.
- PayoutClient : `balance = parseFloat(user.availableBalance) || 0` ; `parseFloat(amount) > balance` → **tout retrait est refusé tant que le solde est ≤ 0** (« Solde disponible insuffisant ») — comportement correct et sûr, mais le placeholder du champ affiche « -24.92 € max », ce qui prête à confusion ; aucun retrait n'est possible tant que la dette n'est pas apurée (décision produit).
- Défaut mineur signalé (non corrigé — périmètre hors I6) : un solde négatif est présenté sans stylistique « dette » dédiée ni explicitation du « Solde disponible insuffisant » pour un photographe endetté ; `/api/me` ne renvoie pas `availableBalance` (le client après payout fait `setUser(d.user)` qui écrase le champ dans le contexte client — sanctionné visible seulement si le composant relit le contexte).

## 7. Limites

- **Pas de vraie clé opérateur** : webhooks exercés avec jetons factices (`token_orange_test`, `token_mvola_test`, `token_airtel_test`) posés AVANT tout appel de handler.
- **API opérateur non câblée** : aucun appel réseau réel (stub global bloquant `fetch`/`https`/`http`) — échecs simulés par le fake Stripe et par le stub réseau (l'égress « opérateur » est attendue et interceptée dans le flux payouts/disbursement).
- **Airtel** : `reference = transaction.id ?? body.reference` (id de transaction, pas forcément le n° de commande métier) — réconciliation fragile sans mapping documenté de l'opérateur.
- **MVola** : référence lue dans `metadata[].key="reference"` (plus `body.reference` en secours), `serverCorrelationId` en `providerRef`.
- **Remboursement mobile money = acte opérateur manuel** : `skipRefund` fait qu'un `refund_pending` reste à traiter à la main ; `retry-refund` ne relance que le chemin Stripe (pas un appel de restitution auprès de l'opérateur).
- Email neutralisé (pas de SMTP) : les alertes tombent en console (`[APERIO-ALERT]`), le code `sendAdminAlert` ne lève jamais.

## 8. Propositions étape 4

1. **Vérification côté opérateur avant toute finalisation de remboursement** — interroger l'API du fournisseur (statut de la transaction / restitution) avant de flipper `refunded` ; sinon un « refunded » sans contrepartie observée chez l'opérateur crée un écart de trésorerie. S'applique aussi au `retry-refund` (ne se limite pas à la carte Stripe).
2. **File « Remboursements à traiter » dans l'UI admin** — lister les ordres `refund_pending` (raison, ref fournisseur, date), filtrer par raison, bouton « Réessayer » → `POST /api/admin/orders/[orderNumber]/retry-refund` (déjà en place), puis marquage « remboursé » une fois la restitution opérateur confirmée manuellement.

## 9. Fichiers (étape 3)

- **Créé** : `app/api/admin/orders/[orderNumber]/retry-refund/route.ts`
- **Modifié** : `lib/orders.ts` (helper `markOrderRefundPendingAfterCancellation`), `lib/mobile-money-confirm.ts` (réécrit), `app/api/webhooks/{orange-money,mvola,airtel-money}/route.ts` (statusKind + action), `scripts/verify-webhooks.ts` (blocs T/U/V/W/X, imports, `postMM` → retourne le body).
- Typecheck : `npx tsc --noEmit` → 0 erreur. Build : exit 0, health OK.