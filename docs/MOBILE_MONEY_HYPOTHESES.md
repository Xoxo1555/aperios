# Mobile Money — Cartographie des callbacks & hypothèses à confirmer

> I6 clôture — tâche 3. Les routeurs webhooks Orange Money / MVola / Airtel
> Money relaient vers `lib/mobile-money-confirm.ts` (`handleMobileMoneyConfirmation`),
> qui retrouve la commande par `orders.order_number` et renvoie **toujours 200**
> quand la référence ne correspond à rien (événement conservé `unmatched` + alerte
> admin, jamais d'erreur à l'opérateur).

## 1. Quel champ retrouve la commande ? (preuve par le code + verify-webhooks bloc AA)

| Opérateur | Champ lu dans le body | Valeur | Statut « succès » | Statut « échec » | Ref fournisseur |
|---|---|---|---|---|---|
| Orange Money | `order_id` (ou `orderId`) | notre `orders.order_number` | `SUCCESS` / `SUCCESSFUL` | `FAILED`, `CANCELLED`, `CANCELLED_BY_USER`, `REJECTED`, `ERROR`, `EXPIRED`, `TIMEOUT`, `DECLINED` | `txnid` (ou `pay_token`) |
| MVola | `metadata[].key === "reference"` (sinon `reference` sommet) | notre `orders.order_number` | `completed` | `failed`, `cancelled`, `rejected`, `error`, `expired`, `timeout`, `declined` | `transactionReference` (ou `serverCorrelationId`) |
| Airtel Money | `transaction.id` (sinon `reference` sommet) | notre `orders.order_number` | `TS` / `SUCCESS` | `TF`, `FAILED`, `CANCELLED`, `REJECTED`, `ERROR`, `EXPIRED` | `transaction.airtel_money_id` |

Résolution (tous opérateurs, dans `handleMobileMoneyConfirmation`) :

- la référence est passée telle quelle à `handleConfirmedPayment(reference, …, { skipRefund: true })`, qui cherche `orders.order_number` (bascule équivalente à Stripe) ;
- si aucune commande : `markWebhookEventUnmatched` → l'événement passe en `unmatched`, `<200>` avec `action: "unmatched"`, alerte admin « fonds à rechercher manuellement » ;
- si dépôt wallet (`WLD-…`) : jamais d'ordre touché, le dépôt est complété/échoué ;
- succès sur commande déjà annulée → `refund_pending (order_cancelled_after_payment)` ;
- échec définitif sur commande `pending` → `cancelled` (aucun crédit, aucun remboursement) ;
- échec sur commande payée/remboursée → audit + alerte, la vente n'est **jamais** annulée ;
- autre statut (transitoire) → événement enregistré `processed`, aucun effet.

Tests : `scripts/verify-webhooks.ts` — bloc **AA** (référence inconnue sur les 3 opérateurs → 200 `unmatched`,
événement `unmatched`, aucune commande créée ; contre-preuve MVola : `metadata.reference` retrouve la commande réelle → `paid`).

## 2. Hypothèses structurées — À CONFIRMER avec de vrais appels opérateur

> Aucune de ces hypothèses n'a pu être vérifiée contre une **vraie** API opérateur
> (pas de sandbox câblée ; les webhooks de test utilisent des jetons **factices** et
> le stub réseau bloque tout l'égress). Tant qu'elles ne sont pas confirmées,
> **le Mobile Money ne doit pas être ouvert en production** (voir ANALYSE.md).

### 2.1 Orange Money
1. **Nom exact du champ référence** : Orange poste-t-il bien `order_id` (notre `orderNumber`) en sommet du body de `notif_url` ? L'alternative `orderId` est acceptée par prudence. À confirmer.
2. **Nom exact du champ statut** : `status` est lu en priorité, `txnstatus` en repli. Les valeurs **réelles** envoyées par Orange (casse exacte : `SUCCESS`, `FAILED` ?) restent à capturer.
3. **Ref fournisseur** : Orange donne-t-il `txnid` (ou `pay_token`) en réponse à notre requête de paiement — faut-il répercuter cette ref dans la requête initiale ?
4. **Format des notifications d'échec** : `CANCELLED_BY_USER`, `TIMEOUT`, `EXPIRED`, `DECLINED` — liste exacte théorique, non confirmée.

### 2.2 MVola
1. **Mécanisme de corrélation** : le callback Yas renvoie-t-il nos `metadata` (`metadata[].key='reference'`) ? L'hypothèse de travail est : la requête de « merchant-pay » doit **renvoyer** notre `orderNumber` dans `partyInfo[name]` + `metadata`. Non confirmé — le passage de la référence dans la requête initiale n'est pas encore implémenté (à vérifier dans `lib/payments/*`).
2. **Casse / valeurs de `transactionStatus`** : le code accepte `completed` (minuscules). MVola/Yas envoie-t-il `COMPLETED`, `SUCCESSFUL`, … ?
3. **Ref fournisseur** : `transactionReference` vs `serverCorrelationId` — lequel porte l'id de transaction côté Yas ?

### 2.3 Airtel Money
1. **Champ de référence du callback** : `transaction.id` est-il bien **notre** référence de requête (généralement l'`id` du body de la requête de collecte), ou Airtel substitue-t-il son propre id ? À confirmer avec une collecte de test.
2. **Statuts** : `TS`/`TF` sont les statuts Airtel documentés (Transaction Success/Fail) ; la casse exacte (`ts` ?) et les statuts annexes (`PENDING`, `REVERSED`…) restent à confirmer.
3. **Authentification des callbacks** : Airtel utilise `bearer` (token). Le mode exact (durée de vie du token, rotation) est supposé.

### 2.4 Commun / transversal
1. **Idempotence des redélivraisons** : comment l'opérateur relance sur notre réponse 500 ? Le mécanisme de dédoublonnage `webhook_events` (événement unique `provider:ref:status`) est préservé, mais le rythme/le nombre de redélivraisons de chaque opérateur sont inconnus.
2. **Horloge / timezone** : aucune donnée horodatée n'est utilisée pour la résolution — sans risque côté logique.
3. **URL de callback (notif_url / callback_url) à fournir à chaque opérateur** lors du câblage : non définie hors environnement de production.