# Aperio — Audit complet (read-only)

> Audit mené le 2026-09-19. Aucun fichier de code n'a été modifié (seul `ANALYSE.md` a été créé).
> Méthode : lecture du code (`app/`, `components/`, `lib/`, `db/`, `scripts/`, `drizzle/`) + vérification d'exécution
> réelle (typecheck, lint, build, serveur dev, API HTTP, requêtes SQL directes).

---

## 0. État des correctifs (revue post-audit, 2026-09-19)

> Statuts : **Corrigé et vérifié par exécution** · **Corrigé non vérifié** · **Ouvert**.
> La preuve est un fichier (code) ou un script exécuté (`scripts/verify-*.ts`, test de migration sur base temporaire).
> *Revu le 2026-09-21 dans le cadre de la clôture des étapes 1-3 (stripe/refunds/disputes, mobile money, dashboard admin).*

| Point | Statut | Preuve / commentaire |
|---|---|---|
| C1 | Corrigé et vérifié par exécution | `lib/webhookAuth.ts:53-62` refuse (403) quand aucun secret n'est configuré ; les routes `app/api/webhooks/*` s'y conforment. Bloc **I** de `scripts/verify-webhooks.ts` : signature manquante / invalide `/ mauvaise clé → 400 avant tout effet`, aucun `webhook_events` créé, commande toujours `pending`. Le chemin « secret vide » lui-même n'est pas télé-testé (les tests tournent avec secrets définis). |
| C2 | Corrigé et vérifié par exécution | `lib/orders.ts` (`finalizeOrderTx` transactionnel + flip de statut gardé) ; `scripts/verify-finalize.ts` (13 tests, séquentiel + concurrent). |
| C3 | Corrigé et vérifié par exécution | `lib/orders.ts` (`payOrderWithWallet`) + `app/api/checkout/wallet/route.ts` (débit + finalisation dans une seule transaction, rollback) ; `scripts/verify-finalize.ts` (tests 3, 8, C5-b wallet), `scripts/verify-idempotency.ts`. |
| C4 | Corrigé et vérifié par exécution | `drizzle/0006_wallet_transactions.sql` (table + index) ; appliqué à blanc 0000→0009 sur base temporaire. |
| C5 | Corrigé et vérifié par exécution | `lib/orders.ts` (numéros en post-décrément, tri), `db/schema.ts:243,269` (index uniques), `drizzle/0009_broad_patch.sql` (CHECK + index unique partiel) ; `scripts/verify-finalize.ts` (C5-a/b/collision), `scripts/verify-deadlock-xy.ts`. |
| I1 | Corrigé non vérifié | `lib/i18n.tsx:10053-10058` (`getServerSnapshot = initialLang`) + `app/layout.tsx:57-64` (cookie `aperio-lang` lu côté serveur, `suppressHydrationWarning`). Non re-testé en navigateur. |
| I2 | Corrigé et vérifié par exécution | `lib/auth-attempts.ts` (nouveau, compteurs DB-backé `auth_attempts`, fail-closed) ; codes à 6 chiffres hashés HMAC-SHA256 + comparaison constante (`lib/auth.ts`, `lib/auth-attempts.ts`) ; routes login/verify/forgot-password : **429 + Retry-After + codes stables** (`lib/auth-http.ts`). `scripts/verify-auth-limits.ts` (11 sections, cœur + handlers POST en direct, 0 échec) : login 5 échecs → verrou email+IP progressif, 25 → email 5 min, 50 → IP 1 h (jamais réarmé par succès) ; envoi 60 s / 5 codes heure ; 5 essais par code (5e échec → code brûlé), 20 échecs/24 h → cooldown 24 h ; 100 requêtes parallèles → ≤ 5 comparaisons ; 10 inscriptions/IP → 429 ; réponses neutres anti-énumération (resend/forgot). Migrations `0011_i2_auth_rate_limits.sql` + `0012_i2_drop_plain_codes.sql` idempotentes (appliquées, base fraîche 0000→0012). |
| I3 | Ouvert | `README.md:49-53,71,101` (1000 photos / 400 Madagascar / 42 users, « images hébergées localement ») vs base réelle : 142 photos hotlinkées Unsplash. |
| I4 | Ouvert | `app/api/payouts/route.ts:41` (`Math.random()`), `:85` (`transactionReference = origin`), `:109` (remboursement sur échec HTTP) ; retry `app/api/admin/payouts/[reference]/retry/route.ts`. |
| I5 | Corrigé non vérifié | `lib/utils.ts:99` (`resolveAssetUrl`) utilisé par `app/photo/[slug]/page.tsx:77,90,174-175` et `app/profile/page.tsx:37,52` ; plus de route `/image/` ni `/api/placeholder`. |
| I6 | Corrigé et vérifié par exécution | `app/api/webhooks/stripe/route.ts` (amendements 1-11) : signature vérifiée puis `webhook_events` enregistré AVANT tout effet (rejeu = 200 no-op), montant vérifié `expected_amount_minor`/`expected_currency` (mismatch → jamais finalisé), gestions `charge.refunded` (finalisé/clawback), `dispute.created/closed` (gagné → flag levé ; perdu → clawback), `refundStripeCharge`, finalisation des refunds en attente. `scripts/verify-webhooks.ts` : blocs A→AB (finalisations réelles, mismatches, refunds simulés via fake Stripe, clawbacks, retry-refund, mark-refunded), `verify-finalize.ts` (13 tests), `verify-idempotency.ts`. |
| I7 | Corrigé et vérifié par exécution | `lib/mobile-money-confirm.ts` + routes `mvola/orange-money/airtel-money` : mapping des statuts (succès/échecs explicites), références de commande (`order_id`/`orderId`, `metadata[].key==="reference"`, `transaction.id`) → succès = `paid` ; référence inconnue → 200 `unmatched` + alerte admin, aucune commande créée ; rejeu sûr via `webhook_events`. Bloc **AA** (unmatched sur les 3 opérateurs + contre-preuve MVola). Détails et hypothèses → `docs/MOBILE_MONEY_HYPOTHESES.md`. |
| I8 | Ouvert (partiel) | 12 des 45 `app/api/**/route.ts` sans aucun try/catch ; corrections ponctuelles (auth, me, upload). |
| I9 | Ouvert | `scripts/seed.ts:454-455` (seuil 500, taxe 8 %) vs `lib/pricing.ts:35,44` (seuil 300, TVA 20 %). |
| I10 | Ouvert | `scripts/import-unsplash.ts` (hotlink sans attribution) ; `scripts/download-images.ps1` sans manifeste de licence. |
| M1 *(noté « I1m » dans l'audit)* | Ouvert | `components/FeaturedCarousel.tsx:182`, `components/DashboardClient.tsx:406` (badges « FREE » / « LIMITED EDITION » codés en dur). |
| M2 | Ouvert | `lib/utils.ts:101` (`aperio.com`), `app/certificates/[serial]/page.tsx` (`aperio.gallery`), sitemap/robots. |
| M3 | Ouvert | `db/schema.ts:66` (table `sessions` toujours définie) ; variables `.env.example` inutilisées. |
| M4 | Ouvert | `proxy.ts` protège `/orders` et `/settings` ; aucune page `app/orders` ni `app/settings` (confirmé par le build). |
| M5 | Ouvert | `app/dashboard/page.tsx:15-30` : bloc acheteur inatteignable en pratique car `proxy.ts` réserve `/dashboard` aux créateurs/admin. |
| M6 | Ouvert | `app/layout.tsx:72` charge `/suppress-errors.js` (filtre d'erreurs JS). |
| M7 | Ouvert | `lib/i18n.tsx` : 437 Ko / 10 039 lignes livrés au client. |
| M8 | Ouvert | `components/Lightbox.tsx:44` (`aria-modal` sans focus-trap ni focus initial). |
| M9 | Ouvert | `app/sitemap.ts:31,45` (`lastModified: new Date()`). |
| M10 | Ouvert | `components/Navbar.tsx:152,202,208,268,318` (classes `hidden hidden`). |
| M11 | Ouvert | `lib/utils.ts:90` (`resizeUrl` ne réécrit que les URLs distantes) ; `components/PhotoViewer.tsx:57`. |
| M12 | Ouvert | `components/PhotoCard.tsx:113` (`window.open(photo.imageUrl)`). |
| M13 | Ouvert | `drizzle/*.sql` : pas d'index sur `orders.user_id`/`status`, `order_items.order_id`/`photo_id`, `certificates.*`, `payouts.user_id`. |
| M14 | Ouvert (audit partiellement inexact) | `db/schema.ts:181` `collections.slug` sans `.unique()` ; mais `photos.slug:111` et `users.email:24` sont déjà `.unique()` (voir inexactitudes ci-dessous). |
| M15 | Ouvert | `.env` / `.env.local` (non affichés) ; dépôt non git (`.gitignore` présent). |
| M16 | Ouvert | `package.json:10` : `db:import` → `scripts/import-unsplash.ts`. |
| M17 | Ouvert | `scripts/fix-seed.cjs` toujours présent. |
| M18 | Ouvert | `lib/mailer.ts` : emails de vérification/reset uniquement, aucune notification de commande. |

### Nouveaux constats (clôture des étapes 1-3, 2026-09-21)

- **N1 — Montants en `::text` sur les sorties payouts.** `app/api/payouts/route.ts:133` et `app/profile/page.tsx:96` : `amount::text AS amount` → l'API renvoie `'50.00'` (chaîne) au lieu d'un nombre. Vérifié par exécution (bloc S : `typeof amount === "string"`). Risque : comparaisons/arithmétique côté client, extrapolations de sommes.
- **N2 — Résolution d'un litige par `dispute.payment_intent`.** `app/api/webhooks/stripe/route.ts:404-408,431-435` : lookup sur `payment_intent` (string) avec repli `charge` seulement si le type n'est pas string. Si Stripe fournit `payment_intent` autrement (objet expansé, null) sans `charge` exploitable, la commande ne sera pas trouvée → alerte « Litige sans commande ». Les tests n'injectent qu'une `charge` string. À re-confirmer sur un litige réel.
- **N3 — Défauts durs à l'upload.** `app/api/uploads/route.ts:59-63` : `basePrice ?? 150` (€) et `totalEditions ?? 30` codés en dur quand le créateur ne renseigne rien (s'appliquent ensuite au panier/wallet/reserve). OK pour démo, piège si un montant différent est attendu.
- **N4 — Comptes et commandes de démonstration (seed).** `scripts/seed.ts:260-267,439-475` : `admin@aperio.gallery/admin123`, créateurs `photo123`, acheteurs `buyer123` + 2 commandes démo et certificats. Probe en base : **aucun** compte de ce type présent en ce moment (142 photos, 0 stock > total) — mais `npm run db:seed` les recrée : ne pas exécuter en production.
- **N5 — `collections` sans `cover_url`.** `db/schema.ts:223-238` : aucune colonne de couverture — aucune pochette de collection n'est stockable/affichable (constat données).
- **N6 — Bornage stock OK.** Vérifié en base : 0 photo avec `available_stock > total_editions` ; la règle est maintenue à l'import et à la création.
- **N7 — Sessions JWT non révoquées après changement de mot de passe.** `lib/session.ts` (cookie JWT 14 jours, jose) : `resetPasswordWithCode` remplace le hash `users.password_hash` sans révoquer les sessions existantes ; un cookie capture reste valable jusqu'à l'expiration (aucune table de révocation, pas de version de secret, ni `jti`/`iat` vérifié). Constat de lecture, non testé par exécution.
- **N8 — Politique de mot de passe minimaliste.** Register (`app/api/auth/route.ts`) et reset (`lib/auth.ts:132-145`) : seule garde `length < 8` → 400 ; aucune exigence de complexité (majuscule/chiffre/symbole), aucune rotation, aucun blocage des réutilisations ; hachage bcrypt coût 10 (`db/schema.ts`). Rapporté tel quel, sans modification (hors périmètre I2).

### Inexactitudes / erreurs de comptage relevées dans l'audit d'origine

- **Numérotation des mineurs** : la première entrée « Mineurs » est étiquetée **`I1m`** (réutilise le préfixe `I1`) au lieu de **`M1`**. Le tableau ci-dessus la traite comme `M1` ; le décompte `M2`–`M18` reste inchangé, ce qui rend la série `M1`–`M18` ambiguë dans l'audit.
- **M14** : l'audit affirme que `photos.slug` et `users.email` n'ont pas d'index unique. C'est **inexact** : `db/schema.ts:111` (`photos.slug`) et `db/schema.ts:24` (`users.email`) portent bien `.unique()`. Seul `collections.slug` (`db/schema.ts:181`) est dépourvu de contrainte d'unicité.
- **I5** : l'audit décrivait `/image/...` et `/api/placeholder/400x400` comme 404. Ces usages ont depuis été remplacés (`resolveAssetUrl`, fallback `logo-badge.png`) ; le point est donc **corrigé** (non vérifié par exécution) et l'énoncé initial n'est plus d'actualité.
- **M5** : le bloc acheteur de `app/dashboard/page.tsx` n'est pas du « code mort » au sens TypeScript (il compile et est atteignable dans le composant) ; il n'est inatteignable qu'à l'exécution à cause de `proxy.ts`. La qualification « dead code » est donc approximative.
- **I8** : l'audit annonce « ~30 handlers sans try/catch ». Le décompte vérifiable est aujourd'hui de **12 fichiers `route.ts` sur 45** sans aucun try/catch (les autres en ont au moins un, parfois partiel). Le chiffre « ~30 » n'est plus exact.

---

## 1. Résumé exécutif

Aperio est une galerie/marketplace photo Next.js 16 (App Router, SSR) + React 19 + TypeScript + Drizzle/PostgreSQL :
le socle fonctionnel (grille, recherche, filtres, lightbox, auth, panier, checkout, certificats, wallet) est **réellement présent et fonctionne**, build et typecheck passent. Mais il s'agit d'une **MVP de démonstration fournie avec des lacunes de production critiques** : le schéma `wallet_transactions` est absent des migrations (un déploiement frais casse), les webhooks de paiement s'ouvrent sans authentification si le secret est vide, la finalisation de commande n'est ni transactionnelle ni idempotente (risques de double-débit/double-certificat), et le rendu serveur/client désynchronise l'i18n (échec d'hydratation observé en console). Le rate-limiting auth (I2) a depuis été corrigé (voir §0). La base actuelle contient 142 photos **hot-linkées depuis Unsplash** (contrairement au README qui annonce 1 000 photos locales) et aucun ordre ni certificat. Aucun test automatisé n'existe.

---

## 2. État constaté par exécution

| Vérification | Résultat |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Passe |
| `npm run build` (Next 16.2.6, Turbopack) | ✅ Compile + TS OK, 19 pages statiques générées, toutes les routes API dynamiques |
| `npm run lint` (`eslint .`) | ❌ 10 problèmes : 8 erreurs `react-hooks/set-state-in-effect` + 2 warnings (`exhaustive-deps` Browse.tsx:137, `no-img-element` LangCurrencySwitcher.tsx:31) |
| Serveur dev (`next dev`) | ✅ Démarre (port 3000), `/`, `/photos`, `/prints`, `/pricing` → 200 ; `/api/health`, `/api/meta`, `/api/photos` → 200 |
| Erreurs runtime observées | ❌ Hydration mismatch **réel** : `components/Navbar.tsx:277` (serveur rend l'anglais, client le français) + warning ratio `images/payments/airtel.svg` (logs `.next/dev/logs/next-development.log`) |
| Base de données (local `app_db`) | 142 photos (108 `free` + 34 `limited`, toutes `is_published`), 25 users, 11 catégories, 90 tags, **0 commande, 0 certificat** |
| Sprint login démo | ✅ `POST /api/auth` admin → 200, cookie `aperio_session` httpOnly (pas `secure` en dev) |
| `scripts/verify-images.ts` | ✅ "100% des images référencées existent" (8 chemins uniques de `src/` seulement) |
| Tests | ❌ Aucun framework ni fichier de test dans le projet |

---

## 3. Tableau des fonctionnalités

| Fonctionnalité | Statut | Preuve / commentaire |
|---|---|---|
| Grille photos + pagination | ✅ | `components/Browse.tsx:85-118`, `/api/photos` paginé (`app/api/photos/route.ts`) ; ⚠️ erreur réseau affichée comme grille vide (`Browse.tsx:112-116`) |
| Chargement des images | ⚠️ Partiel | Lazy loading présent (`PhotoImage.tsx:38`, `Navbar.tsx:187`, etc.) mais base actuelle en **hotlink Unsplash** (`photos.image_url` en base), contrairement au README, et `verify-images.ts` ne vérifie que `src/` (pas la DB) |
| Recherche | ✅ | Suggestions navbar debounce 260 ms (`Navbar.tsx:50-60`), recherche serveur `ilike` paramétrée (`lib/queries.ts:133-141`) |
| Recherche visuelle / par image | ❌ Stub | `Navbar.tsx:163-166` : bouton caméra → `onChange` vide « /* image sélectionnée */ » |
| Filtres (orientation, couleur, catégorie, licence, prix, tri) | ✅ | `Browse.tsx:90-100`, allowlists serveur (`app/api/photos/route.ts:7-9`) |
| Lightbox / zoom | ✅ | `Lightbox.tsx` (clavier `+/-/Esc`, `:28-32`) ; ⚠️ pas de focus-trap a11y (`:44`) |
| Vue détail photo (EXIF, tags, likes, commentaires, téléchargement) | ✅ | `app/photo/[slug]/page.tsx` ; ⚠️ `og:image` cassé (`:77,90,174-175`) ; presets « Large/Medium/Small » inopérants (`PhotoViewer.tsx:57`) ; ancre `#comments` sans cible (`PhotoViewer.tsx:263`) |
| Navigation / navbar | ⚠️ | Menus, méga-menu ok (`Navbar.tsx`, `CategoryMenu.tsx`) mais **hydration mismatch** (voir §5-I1) |
| Carrousel accueil + sections Madagascar | ✅ | `FeaturedCarousel.tsx`, `HomeCarouselSection.tsx` ; ⚠️ 1 requête DB gaspillée `app/page.tsx:25` |
| Comptes, inscription, vérification email | ✅ | `app/api/auth/route.ts`, `verify/route.ts`, OTP réel ; codes hashés HMAC-SHA256, anti-force-brute (voir §4-I2) |
| Login / mot de passe oublié | ✅ | Limites (email+IP 5, email 25, IP 50 ; **429 + Retry-After**), réponse login 401 unifiée, réponses neutres anti-énumération, tout FR (voir §4-I2) |
| Profil par rôle | ✅ | `app/profile/` ; ⚠️ og:image par défaut `/api/placeholder/400x400` → **404** (`profile/page.tsx:38,51`) |
| Upload (wizard + EXIF) | ✅ | `app/api/upload/route.ts` (magic bytes sharp, 50 Mo, HD privé) ; ⚠️ valeurs par défaut codées 150 € / 30 éditions (`uploads/route.ts:54-56`) |
| Dashboard créateur | ✅ | `DashboardClient.tsx` ; ⚠️ bloc « access denied » acheteur mort (dead code, `dashboard/page.tsx:15-30`) |
| Admin (users, commandes, wallet) | ✅ | `app/admin/AdminClient.tsx` + routes RBAC ; ⚠️ POST admin truste les montants client (`admin/orders/route.ts:132-141`) |
| Checkout panier / impression / digital | ⚠️ | Prix recalculés serveur (bon, `lib/orders.ts:50-95`) mais **non transactionnel** et **non idempotent** (§5-C2) ; dépense wallet débitée hors transaction (§5-C3) |
| Paiements Stripe + Mobile Money (OM/MVola/Airtel) | ⚠️ | Intégrations réelles ; ⚠️ webhooks ouverts si secret vide (§5-C1), pas de remboursement, pas de vérif montant |
| Certificats d'authenticité + PDF | ✅ | `app/certificates/[serial]/page.tsx`, `CertificatePdfButton.tsx` (jsPDF) ; ⚠️ GET public sans contrôle propriétaire (`api/certificates/[serial]/route.ts:19`) ; URL `aperio.gallery` codée en dur (`:66`) |
| Portefeuille (wallet, dépôts euros) | ❌/⚠️ | Table `wallet_transactions` **absente des migrations** (§5-C4) ; logique OK (`lib/wallet.ts:107-152`) |
| Payouts créateurs | ⚠️ | Virement auto OM/MVola/Airtel/Stripe, mais Stripe/PayPal/bank-transfert = stubs refusés (`lib/payouts.ts:95-99`), risque double-versement (§5-I4) |
| Responsive | ✅ | `Navbar.tsx:302-324` (burger mobile), classes `lg:`/`hidden` partout |
| Animations | ✅ | `AuroraGlow.tsx`, `BubbleField.tsx`, carrousel auto |
| SEO | ⚠️ | `layout.tsx`, `sitemap.ts`, `robots.ts` présents mais og:image cassé + domaines incohérents (aperio.com / .gallery / .mg) |
| Accessibilité | ⚠️ | `alt` présents, aria-labels présents ; ⚠️ focus-trap lightbox absent, contrastes/z-index non audités, placeholder EN pendant hydratation |
| Performance images | ⚠️ | `next/image` (AVIF/WebP, `next.config.ts:8-11`) + lazy loading ; ⚠️ hotlinks Unsplash non passés par l'optimiseur (`unoptimized` en dev), bundle i18n 436 Ko |
| i18n (10 langues) | ⚠️ | Dictionnaire 10 075 lignes (`lib/i18n.tsx`), switch instantané ok ; ❌ cause l'échec d'hydratation ; toute la page livrée en 10 langues |

---

## 4. Bugs et problèmes classés par gravité

### 🟥 Critiques

- **C1 — Webhooks Mobile Money acceptés sans secret → commandes « payées » par n'importe qui.**
  `lib/webhookAuth.ts:53-57` renvoie `{ ok: true }` si `WEBHOOK_SECRET`/tokens sont vides (warning console). Les `app/api/webhooks/*.ts` s'en remettent à cette seule vérification. En prod mal configurée, un `curl` anonyme peut marquer une commande payée ou créditer un wallet.
- **C2 — Finalisation de commande non transactionnelle et non idempotente.**
  `lib/orders.ts:150-201` (finalizeOrder) et `:324-389` (completeDigitalOrder) : le statut `paid` est écrit à la fin (`:183-186`), mais avant il décrémente le stock (`:165`, en read-modify-write non atomique), crédite le photographe (`:170`) et crée les certificats (`:176-179`). Un crash entre ces étapes laisse la commande `pending` ; le retry du webhook (HTTP 500 → Stripe réessaie) **rejoue tout** : double décrément de stock, double crédit, certificats dupliqués.
- **C3 — Paiement par wallet : débit hors transaction, message trompeur.**
  `app/api/checkout/wallet/route.ts:70-105` : la déduction du solde est committée dans sa propre transaction, puis `finalizeOrder` s'exécute séparément. Si `finalizeOrder` échoue, la réponse dit « votre solde n'a pas été débité » alors qu'il **a bien été débité** (`:103-105`).
- **C4 — `wallet_transactions` absent des migrations SQL.**
  `db/schema.ts:346-373` définit la table ; grep sur `drizzle/*.sql` : **0 occurrence**. La base locale l'a (créée via `drizzle-kit push`), mais un déploiement qui applique `drizzle/*.sql` échouera à l'exécution (wallet, checkout, dashboards).
- **C5 — Survente de stock et collision d'éditions (TOCTOU).**
  `lib/orders.ts:77-92` : `createPendingOrder` lit `available_stock` puis calcule `editionNumber` sans réserver ni atomiser. Deux commandes concurrentes sur la dernière pièce passent toutes deux → survente + n° d'édition dupliqués (n° 3/30 en double). Décret final non atomique non plus (`:165`).

### 🟧 Importants

- **I1 — Échec d'hydratation React (observé en runtime).**
  `lib/i18n.tsx:10032` `getServerSnapshot = () => "en"` : le serveur rend toujours l'anglais, le client lit la langue stockée (localStorage) → mismatch sur **tous** les textes traduits (Navbar) dès qu'un visiteur a choisi une langue. Logs : `.next/dev/logs/next-development.log` (« Hydration failed … at Navbar (components/Navbar.tsx:277:17) »).
- **I2 — Corrigé — Aucun rate-limit / anti-force-brute sur l'auth.**
  Était : login, code email 6 chiffres (espace 10⁶, valable 30 min, jamais consumé par un échec) et reset sans limite ; énumération d'email via `409` register et `404` resend ; comparaison de code non constante dans le temps. Corrigé : `lib/auth-attempts.ts` (compteurs `auth_attempts`, fail-closed, `AuthLimiterError` → 503), codes hashés HMAC-SHA256 + comparaison constante (`timingSafeEqual`), refus limiteur = **429 + Retry-After + code stable** ; login `401 INVALID_CREDENTIALS` unifié (compte absent ou mauvais mot de passe) ; resend/forgot « neutres » (même réponse e-mail connu ou inconnu) ; tout FR. Preuve : `scripts/verify-auth-limits.ts` (sections 1–10 cœur + 11 route-level, 0 échec) + smoke serveur réel (26e tentative → 429, `retry-after: 290`).
- **I3 — Énoncés README ≠ réalité.**
  - « 1 000 photos dont 400 Madagascar » → DB : **142 photos**, 0 Madagascar en base (hotlinks Unsplash, `import-unsplash.ts`). Le seed (`scripts/seed.ts`, ~988 photos locales, 25 users et non 42) n'a pas été appliqué.
  - « Toutes les images hébergées localement » → les 142 `image_url` sont des URLs `images.unsplash.com` (vérifié en base).
- **I4 — Payouts : risque de double versement + références erronées.**
  `app/api/payouts/route.ts:93-125` : si l'opérateur a réellement payé mais que la réponse HTTP a échoué, le code rembourse le solde → **double paiement**. `transactionReference` = `req.nextUrl.origin` (`:85`, bougue de données) ; référence générée avec `Math.random()` (`:41`). Retry admin non atomique → solde négatif (`app/api/admin/payouts/[reference]/retry/route.ts:46-60`). Changements de statut admin sans toucher à la réserve (`app/api/payouts/[id]/route.ts:96-116`).
- **I5 — `/image/...` et `/api/placeholder/400x400` n'existent pas (404 vérifié).**
  og:image et JSON-LD construisent `${NEXT_PUBLIC_URL}/image/${photo.imageUrl}` (`app/photo/[slug]/page.tsx:77,90,174-175`) — aucune route ni rewrite ; et `photo.imageUrl` est souvent une URL absolue externe. Profil : `app/profile/page.tsx:38,51`.
- **I6 — Webhook Stripe : pas de vérification du montant ni de gestion des remboursements.**
  `app/api/webhooks/stripe/route.ts:35-67` : finalise par `client_reference_id` sans comparer `session.amount_total` ; `charge.refunded` / `dispute` ignorés → une commande remboursée reste « paid » et le crédit du photographe n'est jamais annulé. Pas d'idempotency key (`lib/payments/stripe.ts:45`).
- **I7 — Bouge : checkout mvola/orange/airtel n'ont pas de gestion « non-success »/remboursement.**
  `app/api/webhooks/mvola/route.ts:28-31`, `orange-money/route.ts:26-29`, `airtel-money/route.ts:19-22` : tout statut ≠ succès est « accusé et ignoré » ; aucune réversion.
- **I8 — `checkout/wallet` et `payouts` : erreurs implicites 500.**
  ~30 handlers sans try/catch (liste exhaustive dans §A). Un échec DB renvoie un 500 brut au client (ex. `app/api/payouts/[id]/route.ts:12-128`).
- **I9 — Incohérence de calcul seed vs production.**
  `scripts/seed.ts:451-452` : shipping `subtotal>=500 ? 0 : 24`, taxe 8 % ; `lib/pricing.ts:35-44` : seuil **300**, TVA **20 %**. Les commandes de démo ne correspondent jamais aux prix du site.
- **I10 — DOM conformité légale des scripts d'import Unsplash.**
  `scripts/import-unsplash.ts:307-308` hotlink les URLs sans conserver d'attribution (exigence licence API Unsplash) ; `download-images.ps1` (Wikimedia) ne génère aucun manifeste d'attribution/licence.

### 🟨 Mineurs

- **I1m — Hydration/fallbacks EN : placeholders** « Search a work, artwork, author… » rendus en anglais pendant l'hydratation (`Navbar.tsx:46`) ; badges « FREE »/« LIMITED EDITION » codés en dur (`FeaturedCarousel.tsx:182`, `DashboardClient.tsx:406`) ; footer « Crafted with care in Madagascar. » (`Footer.tsx:164`) ; page Achat « Mes achats HD » (§FR) vs Collections en EN (`app/collections/page.tsx`).
- **M2 — Domaine incohérent : `aperio.gallery` codé en dur dans le certificat (`app/certificates/[serial]/page.tsx:66,168`) vs `aperio.com` (sitemap/robots) vs `https://aperio.mg` (`.env.example`) vs `localhost` (`layout.tsx:31`).**
- **M3 — `sessions` : table morte (`db/schema.ts:64`) liée à `sessions` legacy ; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` et `NEXT_PUBLIC_APP_URL` déclarées « inutilisées » dans `.env.example`.**
- **M4 — Route protégées mortes : `/settings` et `/orders` sont dans `proxy.ts:30-32` mais aucune page `app/settings` ni `app/orders` n'existe.**
- **M5 — Bloc dead code** admin/dashboard (`app/dashboard/page.tsx:15-30`).
- **M6 — Layout : `<Script src="/suppress-errors.js">` (`app/layout.tsx:62`) qui filtre des erreurs JS en production (`public/suppress-errors.js`).**
- **M7 — `lib/i18n.tsx` : 436 Ko / 10 075 lignes livrés en intégralité au client (10 langues, pas de code-splitting) ; `t()` ne remplace que la première occurrence et retombe sur la clé brute.**
- **M8 — A11y : lightbox `aria-modal` sans focus-trap ni focus initial (`Lightbox.tsx:44`) ; `role="search"` sur `<form>` (usage non conforme).**
- **M9 — SEO/JSON-LD : `sitemap.ts:31,45` `lastModified: new Date()` (data volatile) ; `locale: "en_US"` fixe (`photo/[slug]/page.tsx:83`).**
- **M10 — Styles : classes dupliquées `hidden hidden` (`Navbar.tsx:152,202,208,268,318`), warning ratio SVG `airtel.svg` en console.**
- **M11 — `components/PhotoViewer.tsx:57` : presets de taille ne marchent que sur les URLs CDN distantes `/digits/digits/file` — sans effet sur les images locales.**
- **M12 — `PhotoCard` télécharge le free par `window.open(photo.imageUrl)` (`PhotoCard.tsx:113`) → ouvre l'original full-size non optimisé.**
- **M13 — Index manquants : `orders.user_id`, `orders.status`, `order_items.order_id`, `order_items.photo_id`, `certificates.*`, `payouts.user_id` (drizzle SQL).**
- **M14 — Tables `collections.slug`, `photos.slug`, `users.email` : no `uniqueIndex` sur `collections` composite (strict).**
- **M15 — Seuels `.env`/`.env.local` contiennent de vraies clés (Stripe test `sk_test…`, SMTP OAuth) — normal en dev mais à ne jamais committer (`.gitignore` couvre) ; le dépôt n'est pas git.**
- **M16 — `npm run db:import` (script) pointé vers `import-unsplash` qui a une licence superflue.**
- **M17 — `scripts/fix-seed.cjs` patch texte jetable — preuve d'un workflow « quick fix » fragile.**
- **M18 — Aucune notification email de commande (finalisé/expédié) — `lib/mailer.ts` ne sert qu'à la vérification et au reset.**

### ❓ Non vérifiable (pas testé)

- Le lien Stripe réel « create Checkout session » et les callbacks réels Orange Money/MVola/Airtel se font avec de vraies API tierces : non exécutés ici (pas de carte réelle ni d'app OAuth opérateur).
- L'envoi d'emails réels via SMTP (compte Gmail) : non déclenché volontairement (même si configuré dans `.env.local`).
- Le rendu visuel final (contrastes, design, animations) sur navigateur : non audité (pas de browser automatisé).
- La conformité exacte des URLs de licence des images Wikimedia (attribution texte).

---

## Section A — Handlers sans try/catch (erreurs implicites 500)

`app/api/photos/route.ts` (GET) · `app/api/photos/[id]/route.ts` (GET+DELETE) · `app/api/photos/[id]/actions/route.ts` (tout POST) · `app/api/photos/[id]/comments/route.ts` · `app/api/photos/[id]/publish/route.ts` · `app/api/artworks/[id]/download/route.ts:41` · `app/api/photos/[id]/file/route.ts:38` · `app/api/collections/route.ts` · `app/api/collections/[id]/route.ts` · `app/api/dashboard/route.ts` · `app/api/meta/route.ts` · `app/api/orders/route.ts` · `app/api/orders/[orderNumber]/route.ts` · `app/api/wallet/route.ts` · `app/api/wallet/deposit/route.ts` · `app/api/payouts/route.ts` · `app/api/payouts/[id]/route.ts` (GET+PUT+PATCH) · `app/api/admin/payouts/[reference]/retry/route.ts` · `app/api/admin/transactions/route.ts` · `app/api/admin/users/route.ts` · `app/api/certificates/[serial]/route.ts` (PUT+DELETE) · `app/api/me/route.ts` (GET+PATCH) · `app/api/me/avatar/route.ts` (DELETE) · `app/api/me/cover/route.ts` (DELETE) · `app/api/uploads/route.ts` (insert photo :119-143, tags :149-164) · `app/api/auth/route.ts` (login/register) · `app/api/auth/verify/route.ts` · `app/api/auth/forgot-password/route.ts`.

---

## 5. Plan d'action priorisé (10 prochaines tâches)

| # | Tâche | Effort | Détails |
|---|---|---|---|
| 1 | Corriger les migrations : ajouter `wallet_transactions` (+ générer ALTER pour environnements existants) | Petit | `drizzle/*.sql` manquant → nouveau fichier `0006_wallet_transactions.sql` aligné sur `db/schema.ts:346-373` ; re-test `drizzle-kit push` + build. |
| 2 | Rendre `finalizeOrder`/`completeDigitalOrder` transactionnels et idempotents | Gros | `lib/orders.ts:150-201,324-389` : un seul `db.transaction`, mise à jour du statut conditionnelle (`WHERE status <> 'paid'`) en premier, décrément de stock atomique `available_stock - 1` avec garde > 0, clés uniques sur certificats. |
| 3 | Fermer le fallback « secret vide = accepté » des webhooks | Petit | `lib/webhookAuth.ts:53-57` : en production sans secret → refuser (403) ; en dev → logger warning et refuser aussi par défaut. |
| 4 | Réparer le paiement wallet (débit + finalisation dans une seule transaction) | Moyen | `app/api/checkout/wallet/route.ts:70-105` → embarquement débit + `finalizeOrder` dans un même txn ; compensation si échec. |
| 5 | ~~Ajouter rate-limiting + anti-force-brute sur login, code de vérification (6 chiffres) et reset~~ **Fait (I2)** | — | `lib/auth-attempts.ts` + codes hashés + comparaison constante + 429/Retry-After (détails et preuve au §0-I2). |
| 6 | Corriger l'hydratation i18n (serveur/client) | Petit | `lib/i18n.tsx:10032` : passer un rendu serveur cohérent (cookie lang lu côté serveur + `suppressHydrationWarning` là où nécessaire) au lieu de `"en"` systématique. |
| 7 | Fermer l'écart « README vs relecture de prod » : re-seed images locales + documenter le vrai seed | Moyen | Exécuter `scripts/seed.ts` (photos locales, Madagascar, comptes) OU réécrire le README ; aligner `seed.ts:451-452` sur `lib/pricing.ts` (seuil 300 / TVA 20 %). |
| 8 | Réparer les meta/SEO : og:image, placeholder, domaines | Petit | `app/photo/[slug]/page.tsx:77,90,174-175`, `app/profile/page.tsx:38,51`, sertir une seule URL canonique en env ; corriger `aperio.gallery` (`certificates/[serial]/page.tsx:66`). |
| 9 | Ajouter la gestion des remboursements + vérif montant webhook Stripe | Gros | `app/api/webhooks/stripe/route.ts` : comparer `session.amount_total`, traiter `charge.refunded`/`dispute` (clawback du crédit photographe). |
| 10 | Verrouiller les vulnérabilités résiduelles : ownership certificats, compteur download public, retry payouts atomique, clamp `limit` admin | Moyen | `app/api/certificates/[serial]/route.ts:19` (limiter aux acheteurs/contact), `photos/[id]/actions/route.ts:69-75` (auth), `admin/payouts/[reference]/retry/route.ts:46-60` (1 seule UPDATE gardée), `admin/orders/route.ts:31-32` (limite), nettoyer les ~30 handlers sans try/catch (voire wrapper générique). |

Tâches suivantes suggérées ensuite (non chiffrées) : corriger erreurs eslint `set-state-in-effect`, ajouter les tests automatisés (framework absent), notification email de commande, `sessions` legacy à migrer/supprimer, audit contrastes/focus a11y, mise en cache des images locales, split du bundle i18n.

---

## Annexe — Stack et architecture (rappel)

- **Stack** : Next.js 16.2.6 (App Router, Turbopack, `proxy.ts` = middleware), React 19.2.6, TypeScript 5.9.3, Tailwind CSS 4.1.17, Bootstrap Icons (CDN), Drizzle ORM 0.45.2 + PostgreSQL (`pg` 8.20), Zustand 5 (panier), jsPDF 4 (certificats), sharp 0.35 (traitement image), exifr 7 (EXIF), jose 6 (JWT edge/serveur), nodemailer 9 (SMTP), stripe 22, zod 4, bcryptjs. Pas de framework de test.
- **Dossiers** :
  - `app/` — routes (pages + API REST). `app/api/*` = backend ; `proxy.ts` = garde de routes JWT/RBAC (edge).
  - `components/` — composants React côté client (Browse, Navbar, PhotoViewer, Lightbox, Checkout…).
  - `lib/` — logique métier : `auth.ts` (auth+OTP), `orders.ts` (moteur commande), `payments/` (Stripe, OM, MVola, Airtel), `wallet.ts`, `payouts.ts`, `i18n.tsx` (10 075 lignes), `queries.ts`, `rbac.ts`, `upload.ts`, `webhookAuth.ts`.
  - `db/` — `schema.ts` (Drizzle, 21 tables) + `index.ts` (pool pg).
  - `drizzle/` — migrations SQL `0000…0005` (⚠️ sans `wallet_transactions`).
  - `scripts/` — `seed.ts`, `import-unsplash.ts` (hotlink), `verify-images.ts`, `download-images.ps1`, `gen-gallery.mjs`, `fix-seed.cjs`.
  - `public/` — images (~48,7 Mo), `uploads/` ; `storage/hd/` (pas dans `/public` ; sources HD privées servies par `api/photos/[id]/file`).
  - `.env` / `.env.local` — DATABASE_URL, JWT_SECRET, SMTP, Stripe (test), Google OAuth, Mobile Money (gitignorés).