# Aperio — Hybrid Photo Platform

Aperio est une marketplace photo hybride combinant un **moteur de stock gratuit** (style
Pexels) et un **moteur de tirages d'art en édition limitée** (style ArtPhotoLimited) :
numérotation des éditions, certificats d'authenticité (PDF), personnalisation des tirages,
grille de prix dynamique, checkout e-commerce — avec une identité visuelle inspirée de
**Madagascar** (lamba, terre rouge, baobabs, lémuriens).

> **Note stack :** la spécification initiale demandait Nuxt 3 + Laravel 12. Cette implémentation
> de référence livre le **même périmètre fonctionnel** sur la stack native du sandbox —
> **Next.js 16 (App Router, SSR) + TypeScript + React 19, PostgreSQL via Drizzle ORM,
> JWT (cookie httpOnly), Bootstrap 5, jsPDF (certificats) et exifr (EXIF)** — avec une couche
> API REST sous `src/app/api/*` et les modèles « Eloquent » dans `src/db/schema.ts`.

---

## 1. Fonctionnalités

### Moteur stock (mode Pexels)
- Téléchargements gratuits en haute résolution (Original / Large / Medium / Small)
- Like, collections, tags, notices d'attribution, liens de don des photographes
- Filtres : orientation, **palette de couleurs**, catégorie, licence, prix, tri

### Moteur art (mode ArtPhotoLimited)
- **Éditions limitées** — ex. `Tirage 3/30`, barres de disponibilité en direct
- **Certificat d'authenticité** — numéro de série + empreinte de vérification,
  page imprimable et **export PDF via jsPDF** (`/certificates/[serial]`)
- **Personnalisateur de tirage** — 6 dimensions × 4 supports (Art Print, Dibond, Encadré,
  Acrylique) avec **matrice de prix dynamique**
- **Checkout e-commerce** — panier, livraison, paiement (démo Stripe/PayPal), décrément du stock

### Comptes, vérification & rôles
- **Vérification email** obligatoire avant activation de la connexion (code 6 chiffres,
  démo affichée dans l'UI ; expédié par email en production)
- **Choix du type de compte** à l'inscription : **Acheteur** ou **Créateur-artiste** —
  rôle visible sur le profil
- Icônes œil (afficher/masquer) sur tous les champs de mot de passe
- Pages de connexion / inscription en **deux colonnes** (visuel pleine hauteur + citation
  en italique, bouton « Continuer avec Google », séparateur « OU AVEC VOTRE EMAIL »)
- JWT signé (jose) stocké en cookie httpOnly

### Navigation & accueil
- Navbar Bootstrap inspirée d'**ArtPhotoLimited** : barre utilitaire + barre principale,
  méga-menu catégories, autocomplétion de recherche, panier, menu compte
- Section photos de l'accueil en **carrousel** avec boutons gauche/droite et défilement auto
- **Vue agrandie / zoom** (lightbox) sur chaque photo, au clic sur l'image
- **Page profil** par rôle (acheteur / créateur-artiste) : bannière, stats, œuvres, collections

### Madagascar
- **1000 photos** seedées dont **400 dédiées à Madagascar** : le sommet d'Andringitra,
  les lémuriens, l'Allée des Baobabs, Nosy Be (vue de ville), les Tsingy de Bemaraha,
  Ranomafana et le Rova d'Antananarivo — via de vraies photos Pexels
- Catégorie « Madagascar » mise en avant, bannière dédiée sur l'accueil
- **Identité malgache** : palette terre rouge / jade / or, motifs lamba (SVG), bande
  tissée dans le footer, citations en serif élégante

---

## 2. Démarrage

```bash
npm install

# Base de données (déjà configurée dans .env)
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
# JWT_SECRET=<votre-secret>

# 1. Créer / mettre à jour le schéma
npx drizzle-kit push

# 2. Seed 1000 photos (400 Madagascar) + 42 utilisateurs
npx tsx scripts/seed.ts

# 3. Lancer
npm run dev          # http://localhost:3000
```

### Comptes de démonstration (déjà vérifiés)

| Rôle          | Email                          | Mot de passe |
|---------------|--------------------------------|--------------|
| Admin         | `admin@aperio.gallery`         | `admin123`   |
| Créateur      | `photographer@aperio.gallery`  | `photo123`   |
| Acheteur      | `buyer@aperio.gallery`         | `buyer123`   |

Nouveau compte → **code de vérification à 6 chiffres** (affiché en démo) → connexion activée.

---

## 3. Schéma (`src/db/schema.ts`)

`users` (rôles + `email_verified`), `email_verifications`, `sessions` (legacy), `categories`,
`tags`/`photo_tags`, `photos` (EXIF jsonb, `license_type`, éditions, orientation, couleur
dominante), `prints_config`, `mounts`, `collections`/`collection_photos`, `likes`,
`orders`/`order_items`, `certificates` (séries + empreintes).

---

## 3bis. Images & licences

Toutes les images du site sont **hébergées localement** dans `public/images/` — aucun
hotlink vers un CDN externe (Pexels, Unsplash, Picsum). Chaque chemin référencé dans
`scripts/seed.ts` ou `src/` correspond à un fichier binaire réel, vérifié automatiquement.

| Fichier | Sujet | Licence |
|---|---|---|
| `hero.jpg`, `isalo.jpg`, `madagascar/*.jpg` | Baobabs, Isalo, lémurien, Tsingy, Rova, Nosy Be, Ranomafana, Andringitra, rizières | Créations originales Aperio (libres de droits) |
| `art/lamba-weave-1.jpg` | Tissage du lamba landy sur métier, Madagascar | Wikimedia Commons — CC BY-SA 4.0 (attribution : « Le travail du lamba landy à Madagascar ») |
| `art/sculpture-1.jpg` | Travail du bois Zafimaniry | Wikimedia Commons — Domaine public |

**Vérification automatique des images** (exigence de production) :

```bash
npx tsx scripts/verify-images.ts
# → OK: 100% DES IMAGES REFERENCEES EXISTENT SUR LE DISQUE - AUCUNE IMAGE CASSEE
```

Le script scanne `src/` et `scripts/seed.ts`, interroge la base de données
(`photos.image_url` / `thumb_url`) et confirme l'existence physique de chaque fichier
sur le disque. Code de sortie non nul en cas d'image manquante.

## 4. API (`src/app/api/*`)

| Route                        | Méthodes | Description |
|------------------------------|----------|-------------|
| `/api/health`                | GET      | Health check |
| `/api/auth`                  | GET/POST | Session, login, register, logout |
| `/api/auth/verify`           | POST     | Vérification / renvoi du code email |
| `/api/photos`                | GET      | Recherche + filtres + pagination |
| `/api/photos/[id]`           | GET      | Détail photo (id ou slug) |
| `/api/photos/[id]/actions`   | POST     | like / unlike / download |
| `/api/meta`                  | GET      | Catégories, dimensions, supports, tags |
| `/api/uploads`               | POST     | Wizard d'upload (EXIF) |
| `/api/dashboard`             | GET      | Analytiques + ventes |
| `/api/orders`                | POST     | Checkout → commande + certificats |
| `/api/collections`           | GET/POST | Lister / créer des collections |
| `/api/collections/[id]`      | POST     | Ajouter / retirer une photo |
