# Aperio — Plateforme photo hybride (Madagascar)

![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.6-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![Font Awesome](https://img.shields.io/badge/Font_Awesome-7-528DD7?logo=fontawesome&logoColor=white)
![Made in Madagascar](https://img.shields.io/badge/Made_in-Madagascar-A32020)

Aperio est une **galerie / marketplace photo hybride** : un **moteur de stock gratuit**
(style Pexels) et un **moteur de tirages d'art en édition limitée** (style ArtPhotoLimited) —
numérotation des éditions, certificats d'authenticité (PDF), personnalisation des tirages,
checkout e-commerce et portefeuille créateur. L'identité visuelle s'inspire de **Madagascar**
(lamba, terre rouge, baobabs, lémuriens).

> **Architecture SSE/CSR mixte** : pages rendues côté serveur (React Server Components) pour les
> données et le SEO, composants clients interactifs (filtres, panier, visualiseur, dashboards),
> et une couche API REST sous `app/api/*`.

---

## Sommaire

- [Stack technique & architecture](#stack-technique--architecture)
- [Fonctionnalités & interface](#fonctionnalités--interface)
- [Base de données](#base-de-données)
- [Intégration Unsplash](#intégration-unsplash)
- [Paiements & webhooks sécurisés](#paiements--webhooks-sécurisés)
- [Démarrage en local](#démarrage-en-local)
- [Variables d'environnement](#variables-denvironnement)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Commandes utiles](#commandes-utiles)
- [Déploiement](#déploiement)

---

## Stack technique & architecture

| Domaine            | Technologie                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| **Framework**      | Next.js 16.2.6 — App Router, React Server Components, Turbopack             |
| **UI**             | React 19.2.6, TypeScript 5.9, Tailwind CSS 4.1                              |
| **Icônes**         | Font Awesome 7 (`@fortawesome/react-fontawesome`) + Bootstrap Icons         |
| **Base de données**| PostgreSQL **Neon** (serverless) via **Drizzle ORM 0.45** + `pg`            |
| **Auth**           | JWT maison signé `jose` (cookie httpOnly) + **Google OAuth** + OTP e-mail   |
| **Paiements**      | Stripe 22 + Mobile Money (MVola, Orange Money, Airtel Money)                |
| **Média**          | `sharp` (traitement), `exifr` (EXIF), Unsplash (galerie de démonstration)   |
| **Divers**         | `zod` (validation), `zustand` (panier), `jsPDF` (certificats), `nodemailer` |

**Arborescence**

```
app/          Routes (pages + API REST). app/api/* = backend.
  ├─ api/     Endpoints REST (auth, photos, orders, wallet, payouts, webhooks…)
  └─ ...      Pages : /photos /prints /pricing /photo/[slug] /dashboard …
components/   Composants clients (Browse, Navbar, CartDrawer, Lightbox, PhotoViewer…)
lib/          Logique métier : auth, session, orders, payments/, wallet, payouts,
              queries, rbac, upload, webhookAuth, i18n (10 langues), hooks
db/           schema.ts (Drizzle, 24 tables) + index.ts (pool pg)
drizzle/      Migrations SQL 0000 → 0012
proxy.ts      Middleware d'authentification / RBAC (edge)
scripts/      seed.ts, import-unsplash.ts, verify-*.ts
public/       Assets statiques ; storage/hd/ = sources HD privées
```

---

## Fonctionnalités & interface

### Moteur stock (mode Pexels)
- Téléchargements gratuits en haute résolution (Original / Large / Medium / Small)
- Like, collections, tags, notices d'attribution, liens de don des photographes
- Filtres : orientation, palette de couleurs, catégorie, licence, prix, tri

### Moteur art (mode ArtPhotoLimited)
- **Éditions limitées** — ex. `Tirage 3/30`, barres de disponibilité en direct
- **Certificat d'authenticité** — numéro de série + empreinte de vérification, page imprimable
  et export **PDF via jsPDF** (`/certificates/[serial]`)
- **Personnalisateur de tirage** — 6 dimensions × 4 supports avec matrice de prix dynamique
- **Checkout e-commerce** — panier, livraison, paiement, décrément de stock transactionnel

### Comptes, vérification & rôles
- **Vérification e-mail** par code à 6 chiffres avant activation de la connexion
- **Choix du rôle** à l'inscription : Acheteur ou Créateur-artiste
- JWT signé (jose) en cookie `httpOnly`, rate-limiting anti-force-brute (login, OTP, reset)
- Connexion **« Continuer avec Google »** (OAuth 2.0)

### Navigation & accueil
- **Navbar modernisée** : barre utilitaire + barre principale, méga-menu catégories,
  autocomplétion de recherche, panier, menu compte
- **Boutons « maison » Font Awesome (`faHouse`)** pour revenir à l'accueil depuis les
  espaces internes (profil, portefeuille, dashboard, admin, payouts)
- **Cartes de catégories avec icônes Font Awesome** associées (paysages, faune, artisanat…)
- Carrousel d'accueil, lightbox / zoom plein écran, pages de connexion en deux colonnes

### Typographie & design
- Corps de texte justifié : **`text-justify` + `hyphens-auto`** pour une lecture soignée
- **Titres centrés** et hiérarchie typographique claire (serif élégante pour les citations)
- Thème **Madagascar** : palette terre rouge / jade / or, motifs lamba (SVG), bande tissée

---

## Base de données

Schéma **Drizzle** (`db/schema.ts`) — **24 tables**, migrations `drizzle/0000…0012`.

| Table(s) | Rôle |
|---|---|
| `users`, `email_verifications`, `password_resets`, `auth_attempts`, `sessions` | Comptes et authentification |
| `categories`, `tags`, `photo_tags` | Taxonomie |
| `photos`, `prints_config`, `mounts` | Œuvres, tailles et supports d'impression |
| `collections`, `collection_photos`, `bookmarks`, `likes`, `comments`, `shares` | Engagement |
| `orders`, `order_items`, `entitlements`, `certificates` | Commandes, licences et certificats |
| `wallet_transactions`, `payouts` | Portefeuille et reversements créateurs |
| `webhook_events` | Journal d'idempotence des webhooks |

**Volumétrie actuelle** (base Neon de production) : **5 075+ entrées** — dont 988 photos,
3 939 relations `photo_tags`, 97 tags, 12 catégories, 6 configurations d'impression,
4 supports, 25 utilisateurs.

---

## Intégration Unsplash

La galerie de démonstration est alimentée par **Unsplash** (`scripts/import-unsplash.ts`) :
des **images HD ciblées par thématiques** sont associées aux catégories du catalogue.

| Catégorie | Thème illustré | Icône |
|---|---|---|
| `madagascar` | Île, baobabs, culture | globe |
| `nature-landscapes` | Paysages naturels | arbre |
| `wildlife` | Faune / lémuriens | plume |
| `urban-architecture` | Villes & architecture | immeuble |
| `people` | Portraits | utilisateur |
| `travel` | Voyage | boussole |
| `street` | Scène de rue | épingle |
| `abstract` | Abstrait | palette |
| `macro` | Macro | feuille |
| `fine-art-still-life` | Nature morte | feuille |
| `aerial` | Vue aérienne | avion |
| `artisanat` | Artisanat malgache | marteau |

> Les images distantes sont optimisées par `next/image` (AVIF/WebP) ; les domaines autorisés
> sont déclarés dans `next.config.ts` (`images.remotePatterns`).

---

## Paiements & webhooks sécurisés

| Opérateur | Intégration | Webhook |
|---|---|---|
| **Stripe** | Checkout hébergé (carte) | `app/api/webhooks/stripe` — signature vérifiée, montant contrôlé, remboursements / litiges |
| **MVola** | Yas / Telma Madagascar | `app/api/webhooks/mvola` |
| **Orange Money** | Orange Developer | `app/api/webhooks/orange-money` |
| **Airtel Money** | Airtel Africa OpenAPI | `app/api/webhooks/airtel-money` |

- **Fail-closed par conception** (`lib/webhookAuth.ts`) : sans `WEBHOOK_SECRET` (ou secret par
  opérateur), **tous les webhooks répondent HTTP 403** — aucun paiement ne peut être validé.
- **Idempotence** : chaque événement est enregistré dans `webhook_events` avant tout effet ;
  un rejeu est un no-op sûr.
- **Finalisation transactionnelle** : débit de stock, crédit créateur et génération des
  certificats se font dans une même transaction (pas de double débit / double certificat).

---

## Démarrage en local

**Prérequis** : Node.js 20+, une base PostgreSQL accessible (Neon ou local), npm.

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
copy .env.example .env.local      # Windows
cp .env.example .env.local        # Linux / macOS
# → renseigner au minimum DATABASE_URL et JWT_SECRET

# 3. Appliquer le schéma Drizzle (24 tables)
npm run db:push

# 4. (optionnel) Importer des photos de démonstration depuis Unsplash
npm run db:import

# 5. Lancer le serveur de développement
npm run dev            # http://localhost:3000
```

---

## Variables d'environnement

Copiez `.env.example` vers `.env.local` et renseignez les valeurs. **Ne committez jamais** ces
fichiers (déjà couverts par `.gitignore`).

| Variable | Requis | Description |
|---|---|---|
| `NEXT_PUBLIC_URL` | oui | URL publique canonique (sitemap, robots, OG, JSON-LD), sans slash final |
| `DATABASE_URL` | oui | Connexion PostgreSQL (Neon) — l'app refuse de démarrer sans elle |
| `JWT_SECRET` | oui | Clé HS256 de signature des sessions (`openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | non | OAuth Google (bouton « Continuer avec Google ») |
| `NEXT_PUBLIC_APP_URL` | requis pour Google OAuth | Base de la `redirect_uri` envoyée à Google : `<NEXT_PUBLIC_APP_URL>/api/auth/google/callback` (ex. `https://aperios-mg.vercel.app`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | non | Envoi des e-mails (vérification, reset) via nodemailer |
| `STRIPE_SECRET_KEY` | non | Clé secrète Stripe (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | non | Signature des webhooks Stripe (`whsec_…`) |
| `WEBHOOK_SECRET` | **recommandé** | Secret partagé des webhooks Mobile Money (fail-closed si absent) |
| `ORANGE_MONEY_AUTH_HEADER` / `ORANGE_MONEY_MERCHANT_KEY` / `ORANGE_MONEY_COUNTRY` | non | Orange Money |
| `MVOLA_CONSUMER_KEY` / `MVOLA_CONSUMER_SECRET` / `MVOLA_MERCHANT_MSISDN` / `MVOLA_BASE_URL` / `MVOLA_PARTNER_NAME` | non | MVola (Yas) |
| `AIRTEL_CLIENT_ID` / `AIRTEL_CLIENT_SECRET` / `AIRTEL_ENV` / `AIRTEL_COUNTRY` / `AIRTEL_CURRENCY` | non | Airtel Money |
| `UNSPLASH_ACCESS_KEY` | non | Import Unsplash (`npm run db:import`) uniquement |

> **Note** : l'authentification n'utilise **pas** NextAuth. La variable de session est
> `JWT_SECRET` (équivalent fonctionnel d'un `NEXTAUTH_SECRET`).

---

## Comptes de démonstration

Présents en base (créés par le seed) :

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Admin | `admin@aperio.gallery` | `admin123` |
| Créateur | `photographer@aperio.gallery` | `photo123` |
| Acheteur | `buyer@aperio.gallery` | `buyer123` |

> Nouveau compte → **code de vérification à 6 chiffres** ; ne pas ré-exécuter le seed de
> démonstration en production.

---

## Commandes utiles

```bash
npm run dev        # Serveur de développement (http://localhost:3000)
npm run build      # Build de production (Turbopack)
npm run start      # Servir le build de production
npm run lint       # ESLint (next/core-web-vitals)
npm run typecheck  # Vérification des types (tsc --noEmit)
npm run db:push    # Appliquer le schéma Drizzle à la base
npm run db:import  # Importer des photos Unsplash de démonstration
```

---

## Déploiement

1. Déployer sur **Vercel** (Node 20+), framework détecté automatiquement.
2. Définir les variables d'environnement dans le dashboard (au minimum `DATABASE_URL`,
   `JWT_SECRET`, `NEXT_PUBLIC_URL`).
3. Renseigner **`WEBHOOK_SECRET`** et les clés de paiement **live** ; sans secret, les webhooks
   Mobile Money sont refusés (403).
4. Configurer l'URI de redirection Google OAuth : `https://<domaine>/api/auth/google/callback`.
5. Enregistrer les URLs de webhook Stripe / Mobile Money côté opérateurs.

> **Important** : les uploads de fichiers s'appuient sur le système de fichiers local — pour une
> production serverless, brancher un stockage objet externe (S3 / Supabase / Cloudinary).

---

<p align="center"><em>Aperio — Crafted with care in Madagascar.</em></p>
