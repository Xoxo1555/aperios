/**
 * APERIO — Fine Art Gallery — Production seeder
 * 1000+ photos avec visuels locaux (public/images/gallery/), 42 utilisateurs,
 * artisanat malgache, prix réels en MGA convertibles en EUR/USD via lib/money.ts.
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { MGA_PER_UNIT } from "../lib/money";
import { db } from "../db";
import {
  categories, certificates, collectionPhotos, collections,
  emailVerifications, likes, mounts, orderItems, orders,
  photoTags, photos, printsConfig, sessions, tags, users,
} from "../db/schema";
import { computeUnitPrice } from "../lib/pricing";
import { assertLocalDatabase } from "./lib/assert-local-db";

assertLocalDatabase();

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* EUR canonique stocké = MGA / (MGA par EUR). Le module lib/money.ts
 * reconvertit ensuite ce montant EUR en MGA ou USD à l'affichage. */
function mgaToEur(mga: number): number {
  return Math.round((mga / MGA_PER_UNIT.EUR) * 100) / 100;
}

/* ---------------------------------------------------------------------------
 * Visuels locaux — galerie d'art vectorielle originale (public/images/gallery/),
 * chaque fichier est un composant SVG représentant un motif du patrimoine
 * malgache (baobabs, lémuriens, sculpteurs d'Ambositra, tissage Zafimaniry,
 * paysages, faune…). Vérification : npx tsx scripts/verify-images.ts
 * ------------------------------------------------------------------------- */
const G = (name: string) => `/images/gallery/${name}.svg`;

const LOCAL_IMAGES: Record<string, string[]> = {
  "nature-landscapes": [G("baobab-01"), G("baobab-02"), G("isalo-01"), G("isalo-02"), G("andringitra-01"), G("andringitra-02"), G("ranomafana-01"), G("ranomafana-02"), G("rizieres-01")],
  "urban-architecture": [G("rova-01"), G("rova-02"), G("nosybe-01"), G("portrait-01")],
  "wildlife": [G("lemur-01"), G("lemur-02"), G("chameleon-01"), G("chameleon-02"), G("faune-01"), G("faune-02"), G("ranomafana-02")],
  "people": [G("portrait-01"), G("portrait-02"), G("lemur-03"), G("nosybe-02")],
  "travel": [G("isalo-03"), G("andringitra-03"), G("rizieres-02"), G("nosybe-03"), G("pirogue-01"), G("pirogue-02")],
  "street": [G("rova-02"), G("portrait-03"), G("nosybe-01")],
  "abstract": [G("tsingy-01"), G("tsingy-02"), G("weave-ambositra-01"), G("lamba-01")],
  "macro": [G("chameleon-03"), G("lemur-04"), G("ranomafana-03")],
  "fine-art-still-life": [G("sculpture-ambositra-01"), G("sculpture-ambositra-02"), G("lamba-02"), G("portrait-04")],
  "aerial": [G("rizieres-03"), G("andringitra-01"), G("isalo-03")],
  "artisanat": [
    G("weave-ambositra-01"), G("weave-ambositra-02"), G("weave-ambositra-03"),
    G("sculpture-ambositra-01"), G("sculpture-ambositra-02"), G("sculpture-ambositra-03"),
    G("lamba-01"), G("lamba-02"), G("lamba-03"),
    G("portrait-01"), G("portrait-02"), G("portrait-03"),
  ],
  "madagascar": [
    G("baobab-01"), G("baobab-02"), G("baobab-03"), G("baobab-04"),
    G("lemur-01"), G("lemur-02"), G("lemur-03"), G("lemur-04"),
    G("tsingy-01"), G("tsingy-02"), G("tsingy-03"),
    G("isalo-01"), G("isalo-02"), G("isalo-03"),
    G("chameleon-01"), G("chameleon-02"), G("chameleon-03"),
    G("rizieres-01"), G("rizieres-02"), G("rizieres-03"),
    G("nosybe-01"), G("nosybe-02"), G("nosybe-03"),
    G("andringitra-01"), G("andringitra-02"), G("andringitra-03"),
    G("ranomafana-01"), G("ranomafana-02"), G("ranomafana-03"),
    G("portrait-01"), G("portrait-02"), G("portrait-03"), G("portrait-04"),
    G("pirogue-01"), G("pirogue-02"), G("rova-01"), G("rova-02"),
    G("faune-01"), G("faune-02"), G("faune-03"),
    G("weave-ambositra-01"), G("sculpture-ambositra-01"), G("lamba-01"),
  ],
};

/* Déduit la clé de motif depuis un chemin /images/gallery/<motif>-NN.svg */
function motifKey(path: string): string {
  const f = path.split("/").pop()!.replace(/\.svg$/, "");
  if (f.startsWith("weave-ambositra")) return "weave-ambositra";
  if (f.startsWith("sculpture-ambositra")) return "sculpture-ambositra";
  return f.split("-")[0];
}

/* Titres éditoriaux réels (français) par motif */
const EDITORIAL: Record<string, string[]> = {
  baobab: ["L'Allée des Baobabs, crépuscule d'or", "Le Baobab millénaire de Morondava", "Adansonia grandidieri, sentinelle de l'Ouest", "Baobabs sous un ciel d'ambre"],
  lemur: ["Maki catta, regard de jais", "Sifaka soyeux dans la canopée", "Indri, voix de la forêt primaire", "Famille de lémuriens au réveil"],
  tsingy: ["Tsingy de Bemaraha, cathédrale de calcaire", "Les Aiguilles de Bemaraha", "Forêt de pierre de l'Ouest malgache", "Tsingy, la cité minérale"],
  "weave-ambositra": ["Tissage Zafimaniry, héritage d'Ambositra", "Vannerie fine des hauts plateaux", "Motifs géométriques de la forêt sacrée", "Le métier à tisser betsileo"],
  portrait: ["Portrait d'artisan, atelier d'Ambositra", "Le Regard du sculpteur", "Main de tisserande au travail", "Jeune Créatrice des hauts plateaux"],
  isalo: ["Canyons ocre de l'Isalo", "Piscine naturelle du parc de l'Isalo", "L'Isalo au coucher du soleil", "Falaises de grès de l'Ouest"],
  chameleon: ["Caméléon panthère de Nosy Be", "Parson's chameleon, vert émeraude", "Caméléon des forêts d'Andasibe", "Reptile aux yeux de perle"],
  rizieres: ["Rizières en terrasses de Betsileo", "Vallée rizicole vue du ciel", "Le Paysage mouvant des rizières", "Escargots verts des hauts plateaux"],
  nosybe: ["Nosy Be, lagons turquoise", "Plage de Nosy Iranja", "Hell-Ville vue de la mer", "Sable blanc de l'archipel"],
  andringitra: ["Pic Boby, toit de l'Andringitra", "Sommets granitiques d'Andringitra", "Andringitra dans la brume", "Crête de l'Imarivolanitra"],
  ranomafana: ["Forêt humide de Ranomafana", "Cascade de la forêt primaire", "Brouillard sur la canopée", "Namorona, rivière de Ranomafana"],
  lamba: ["Lamba landy, soie sauvage de Madagascar", "Étoffe cérémonielle betsileo", "Le Lamba, tissu de mémoire", "Soie d'Ambalavao, atelier Soalandy"],
  "sculpture-ambositra": ["Porte sculptée Zafimaniry", "Bois précieux d'Ambositra", "Sculpture sur bois, fontaine d'H", "Masque rituel en bois dur"],
  pirogue: ["Pirogue sur le canal des Pangalanes", "La Barque et le lagon", "Pêcheur au large de l'Est", "Traversée silencieuse"],
  rova: ["Le Rova d'Antananarivo", "Palais de la Reine, colline d'Analamanga", "Rova, mémoire royale", "La Colline sacrée de Tana"],
  faune: ["Zébu, bête de somme des hauts plateaux", "Zébu au cou puissant, bétail sacré", "Oiseau endémique des forêts", "Faune de l'océan Indien"],
};

/* Descriptions artisanales (matière, geste, région) par motif */
const ARTISAN_DESC: Record<string, string[]> = {
  baobab: [
    "Tirage d'art de la série « Île Rouge ». Papier coton 300 g/m², rendu des ocres minéraux de l'Ouest malgache, numéroté et certifié.",
    "Édition limitée célébrant l'Adansonia grandidieri, arbre emblématique de Morondava, imprimée sur papier d'archives.",
  ],
  lemur: [
    "Portrait de lémurien endémique réalisé lors d'une sortie naturaliste. Tirage fine art sur papier mat 200 g/m².",
    "Capture de la faune unique de Madagascar, éditée en série signée par le photographe.",
  ],
  tsingy: [
    "Le calcaire taillé par l'érosion devient sculpture naturelle. Tirage d'art sur papier baryté 255 g/m².",
    "Hommage à la réserve de Bemaraha, Patrimoine mondial de l'UNESCO, en édition limitée.",
  ],
  "weave-ambositra": [
    "Tissage Zafimaniry, savoir-faire inscrit au patrimoine immatériel de l'UNESCO. Tirage présentant le métier et les motifs géométriques.",
    "Vannerie et tissu des hauts plateaux : chaque motif raconte une lignée. Édition artisanale numérotée.",
  ],
  portrait: [
    "Portrait de créateur malgache saisi dans son atelier. Tirage d'art signé, papier d'archives 100 % coton.",
    "Le geste de l'artisan mis en lumière : tirage fine art édition limitée et certifiée.",
  ],
  isalo: [
    "Canyons de grès de l'Isalo, parc national du Sud-Ouest. Tirage sur papier mat d'archives, numéroté.",
    "Piscines naturelles et falaises ocre : édition limitée de la série « Terre Rouge ».",
  ],
  chameleon: [
    "Caméléon panthère de Nosy Be, espèce emblématique de la côte nord. Tirage fine art sur papier 200 g/m².",
    "Reptile endémique photographié in situ. Édition limitée, certifiée et numérotée.",
  ],
  rizieres: [
    "Rizières en terrasses du pays Betsileo, vues du ciel. Tirage d'art sur papier d'archives.",
    "Le paysage vivant des hauts plateaux : édition limitée célébrant le travail de la terre.",
  ],
  nosybe: [
    "Lagons turquoise de Nosy Be, « l'île parfumée ». Tirage fine art sur papier mat 200 g/m².",
    "Sable blanc et mer d'émeraude : édition limitée de la série « Océan Indien ».",
  ],
  andringitra: [
    "Massif granitique d'Andringitra et Pic Boby, plus haut sommet de Madagascar. Tirage d'art numéroté.",
    "Alpinisme et lumière d'altitude : édition limitée sur papier baryté.",
  ],
  ranomafana: [
    "Forêt primaire humide de Ranomafana, réserve de biosphère. Tirage fine art sur papier d'archives.",
    "Brume et canopée : édition limitée de la série « Forêts sacrées ».",
  ],
  lamba: [
    "Lamba landy, soie sauvage filée et tissée à la main à Ambalavao. Tirage présentant l'étoffe cérémonielle.",
    "Le lamba, tissu de mémoire et de transmission : édition artisanale numérotée.",
  ],
  "sculpture-ambositra": [
    "Bois sculpté d'Ambositra, capitale de l'artisanat Zafimaniry. Tirage mettant en valeur la porte ciselée.",
    "Sculpture sur bois précieux, geste transmis de père en fils : édition limitée certifiée.",
  ],
  pirogue: [
    "Pirogue traditionnelle sur le canal des Pangalanes. Tirage d'art sur papier mat d'archives.",
    "La barque et le lagon : édition limitée de la série « Vie d'eau ».",
  ],
  rova: [
    "Le Rova d'Antananarivo, colline sacrée et mémoire royale. Tirage fine art sur papier baryté.",
    "Palais de la Reine et toits en bois : édition limitée numérotée.",
  ],
  faune: [
    "Zébu, cœur de l'économie et du rituel des hauts plateaux. Tirage d'art sur papier d'archives.",
    "Faune de Madagascar, entre domesticité et sauvage : édition limitée certifiée.",
  ],
};

/* Fourchettes de prix réels en MGA par motif (éditions limitées) */
const MGA_PRICE: Record<string, [number, number]> = {
  baobab: [120000, 400000], isalo: [140000, 450000], andringitra: [150000, 480000],
  ranomafana: [130000, 420000], rizieres: [150000, 500000], nosybe: [120000, 380000],
  lemur: [100000, 350000], chameleon: [90000, 320000], faune: [90000, 300000],
  tsingy: [110000, 360000], "weave-ambositra": [160000, 520000], portrait: [110000, 380000],
  "sculpture-ambositra": [180000, 600000], lamba: [150000, 550000], pirogue: [100000, 340000],
  rova: [110000, 360000],
};

/* Catégories (icônes Bootstrap pour l'admin, mais la navbar utilise des
 * icônes SVG fines côté client). Artisanat ajouté pour le patrimoine. */
const CATEGORIES = [
  { name: "Madagascar", slug: "madagascar", kind: "both" as const, icon: "bi-globe-africa", desc: "L'île Rouge : sommets d'Andringitra, lémuriens de Ranomafana, Allée des Baobabs, Tsingy de Bemaraha", sort: 1, cover: G("baobab-01") },
  { name: "Nature & Paysages", slug: "nature-landscapes", kind: "both" as const, icon: "bi-tree-fill", desc: "Parcs nationaux, forêts primaires, océan Indien et grands espaces protégés", sort: 2, cover: G("isalo-01") },
  { name: "Urbain & Architecture", slug: "urban-architecture", kind: "both" as const, icon: "bi-buildings-fill", desc: "Antananarivo, Nosy Be, cités historiques et architectures coloniales", sort: 3, cover: G("rova-01") },
  { name: "Faune & Sauvage", slug: "wildlife", kind: "stock" as const, icon: "bi-bug-fill", desc: "Lémuriens, caméléons, oiseaux endémiques et faune de l'océan Indien", sort: 4, cover: G("lemur-01") },
  { name: "Portraits & Humain", slug: "people", kind: "stock" as const, icon: "bi-person-badge-fill", desc: "Artisans, paysans, créateurs malgaches et regards du quotidien", sort: 5, cover: G("portrait-01") },
  { name: "Voyage & Aventure", slug: "travel", kind: "stock" as const, icon: "bi-compass-fill", desc: "Routes de l'Isalo, pirogues des Pangalanes, trek dans le massif du Makay", sort: 6, cover: G("nosybe-01") },
  { name: "Street Photography", slug: "street", kind: "stock" as const, icon: "bi-signpost-split-fill", desc: "Marchés d'Analakely, ruelles d'Antananarivo, scènes de la vie malgache", sort: 7, cover: G("rova-02") },
  { name: "Abstrait & Textures", slug: "abstract", kind: "both" as const, icon: "bi-palette2", desc: "Motifs géométriques Zafimaniry, textures des pierres levées, formes organiques", sort: 8, cover: G("tsingy-01") },
  { name: "Macro & Détails", slug: "macro", kind: "art" as const, icon: "bi-binoculars-fill", desc: "Élytres de coléoptères, gouttes sur feuilles de ravenala, détails de soie", sort: 9, cover: G("chameleon-03") },
  { name: "Nature Morte", slug: "fine-art-still-life", kind: "art" as const, icon: "bi-flower1", desc: "Poterie betsileo, vannerie antemoro, instruments de musique traditionnels", sort: 10, cover: G("sculpture-ambositra-01") },
  { name: "Aérien & Drone", slug: "aerial", kind: "both" as const, icon: "bi-airplane-fill", desc: "Rizières en terrasse vues du ciel, côtes malgaches, archipels et mangroves", sort: 11, cover: G("rizieres-01") },
  { name: "Artisanat Malgache", slug: "artisanat", kind: "art" as const, icon: "bi-hammer", desc: "Bois sculpté d'Ambositra, tissage Zafimaniry, lamba landy et métiers d'art du pays", sort: 12, cover: G("weave-ambositra-01") },
];

const TAGS_BY_CAT: Record<string, string[]> = {
  madagascar: ["madagascar", "ile-rouge", "andringitra", "lemur", "maki", "sifaka", "indri", "baobab", "allees-des-baobabs", "morondava", "tsingy", "bemaraha", "nosy-be", "ranomafana", "isalo", "rova", "antananarivo", "hauts-plateaux", "rizieres", "terre-rouge", "pirogue", "pangalanes", "lamba", "artisanat", "ambositra", "zafimaniry"],
  "nature-landscapes": ["montagnes", "foret", "ocean", "lever-de-soleil", "coucher-de-soleil", "brume", "cascade", "desert", "fleurs", "lac"],
  "urban-architecture": ["skyline", "facade", "neon", "metro", "toit-terrasse", "beton", "ruelle", "pont", "nuit", "verre"],
  wildlife: ["oiseau", "predateur", "safari", "vie-marine", "yeux", "fourrure", "plumes", "camouflage"],
  people: ["portrait", "candid", "studio", "mains", "regard", "sourire"],
  travel: ["route", "cote", "village", "ile", "feu-de-camp", "horizon"],
  street: ["pluie", "marche", "velo", "graffiti", "fenetre"],
  abstract: ["geometrique", "courbe", "gradient", "peinture", "mouvement"],
  macro: ["rose", "petale", "insecte", "plume", "givre"],
  "fine-art-still-life": ["vase", "fruit", "bougie", "livre", "ceramique"],
  aerial: ["ligne-cotiere", "champs", "archipel", "riviere", "dunes"],
  artisanat: ["ambositra", "zafimaniry", "bois", "sculpture", "tissage", "lamba", "vannerie", "metier", "artisanat", "betsileo"],
};

/* Photographes & artisans — tous rattachés à des lieux réels de Madagascar.
 * Le premier conserve l'email de démo documenté dans le README (rôle Créateur). */
const PHOTOGRAPHERS = [
  { name: "Rija Andriamihaja", email: "photographer@aperio.gallery", location: "Antananarivo", bio: "Hauts plateaux — rizières et lumières de Tana. Compte de démonstration du rôle créateur.", instagram: "@rija.photo", specialties: "paysages, architecture" },
  { name: "Hery Rakoto", email: "hery@aperio.gallery", location: "Morondava", bio: "L'Allée des Baobabs au crépuscule, entre sable et ciel d'ambre.", instagram: "@hery.baobab", specialties: "paysages, coucher de soleil" },
  { name: "Voahangy Randrianasolo", email: "voahangy@aperio.gallery", location: "Nosy Be", bio: "La mer, les pirogues et la vie côtière de l'île parfumée.", instagram: "@voahangy", specialties: "mer, portraits" },
  { name: "Tiana Rasoanaivo", email: "tiana@aperio.gallery", location: "Ranomafana", bio: "Lémuriens et caméléons de la forêt humide, naturaliste passionnée.", instagram: "@tiana.foret", specialties: "faune, macro" },
  { name: "Mialy Ratsimbazafy", email: "mialy@aperio.gallery", location: "Antsirabe", bio: "Tsingy, canyons et terre rouge de l'Ouest malgache.", instagram: "@mialy.tsingy", specialties: "paysages, aerial" },
  { name: "Faly Andrianarisoa", email: "faly@aperio.gallery", location: "Antananarivo", bio: "Le Rova, les marchés et le patrimoine royal des Analamanga.", instagram: "@faly.heritage", specialties: "patrimoine, street" },
  { name: "Lova Rakotomalala", email: "lova@aperio.gallery", location: "Andringitra", bio: "Trekker des sommets — Pic Boby et au-delà, guides des hauts plateaux.", instagram: "@lova.sommet", specialties: "montagne, aventure" },
  { name: "Onja Razafindrakoto", email: "onja@aperio.gallery", location: "Toamasina", bio: "Le canal des Pangalanes et la côte Est, entre pirogues et lagon.", instagram: "@onja.east", specialties: "cote, voyage" },
  { name: "Njaka Raveloson", email: "njaka@aperio.gallery", location: "Toliara", bio: "Le Sud sauvage — baobabs, épineux, sable blanc et zébus.", instagram: "@njaka.sud", specialties: "paysages, safari" },
  { name: "Hanta Andrianjafy", email: "hanta@aperio.gallery", location: "Antananarivo", bio: "Portraits de créateurs et d'artisans malgaches saisis dans leurs ateliers.", instagram: "@hanta.portrait", specialties: "portraits, artisanat" },
  { name: "Soa Rakotondrabe", email: "soa@aperio.gallery", location: "Fianarantsoa", bio: "Vignobles des hautes terres et collines du Betsileo, pays du riz.", instagram: "@soa.hauts", specialties: "vignobles, paysages" },
  { name: "Tovo Razanamasy", email: "tovo@aperio.gallery", location: "Mahajanga", bio: "Baobabs de Madagascar Ouest et ciels étoilés de la baie de Bombetoka.", instagram: "@tovo.etoiles", specialties: "paysages, nocturne" },
  { name: "Bodo Ranaivo", email: "bodo@aperio.gallery", location: "Diego Suarez", bio: "Baies turquoise, randonnées et lagons de la pointe nord.", instagram: "@bodo.diego", specialties: "cote, aventure" },
  { name: "Volana Rasoarimalala", email: "volana@aperio.gallery", location: "Antananarivo", bio: "Tisserande du lamba landy à Ambalavao — soie sauvage et métiers d'art.", instagram: "@volana.lamba", specialties: "tissage, artisanat" },
  { name: "Dina Andriantsitohaina", email: "dina@aperio.gallery", location: "Ihosy", bio: "Le plateau de l'Horombe et la route de l'Isalo, terre des cimes ocres.", instagram: "@dina.isalo", specialties: "paysages, Isalo" },
  { name: "Kolo Rakotoniaina", email: "kolo@aperio.gallery", location: "Sainte-Marie", bio: "Baleines à bosse et lagons de l'île aux nattes, entre océan et forêt.", instagram: "@kolo.whale", specialties: "faune, mer" },
  { name: "Sariaka Razafindrabe", email: "sariaka@aperio.gallery", location: "Antananarivo", bio: "Lémuriens en semi-liberté, parcs et réserves autour de la capitale.", instagram: "@sariaka.lemur", specialties: "faune, nature" },
  { name: "Mamy Rasolonjatovo", email: "mamy@aperio.gallery", location: "Ambositra", bio: "Ébéniste Zafimaniry — sculptures sur bois précieux, motifs géométriques transmis de père en fils.", instagram: "@mamy.zafimaniry", specialties: "sculpture, artisanat" },
  { name: "Irina Ravalomanana", email: "irina@aperio.gallery", location: "Antananarivo", bio: "Peintres et sculpteurs malgaches contemporains, directrice de la fondation d'art H.", instagram: "@irina.art", specialties: "art, portraits" },
  { name: "Lanto Rasoamahenina", email: "lanto@aperio.gallery", location: "Isalo", bio: "Canyons et piscines naturelles du parc de l'Isalo, garde et photographe du Sud.", instagram: "@lanto.isalo", specialties: "Isalo, paysages" },
  { name: "Tefy Rakotoarivelo", email: "tefy@aperio.gallery", location: "Ambositra", bio: "Maître-carver Zafimaniry — portes et meubles sculptés, bois d'eucalyptus et palissandre.", instagram: "@tefy.carver", specialties: "sculpture, bois" },
  { name: "Lalao Razafindraibe", email: "lalao@aperio.gallery", location: "Fianarantsoa", bio: "Tisserande betsileo — lamba cérémoniel et indigo, ateliers d'Ambalavao.", instagram: "@lalao.lama", specialties: "tissage, artisanat" },
];

const CAMERAS = [
  { model: "Canon EOS R5", lenses: ["RF 24-70mm f/2.8 L", "RF 70-200mm f/2.8 L", "RF 50mm f/1.2 L"] },
  { model: "Sony A7 IV", lenses: ["FE 24-70mm f/2.8 GM", "FE 85mm f/1.4 GM", "FE 16-35mm f/2.8 GM"] },
  { model: "Nikon Z9", lenses: ["Z 24-70mm f/2.8 S", "Z 70-200mm f/2.8 S", "Z 50mm f/1.2 S"] },
  { model: "Fujifilm X-T5", lenses: ["XF 33mm f/1.4", "XF 16-55mm f/2.8", "XF 56mm f/1.2"] },
  { model: "Leica M11", lenses: ["Summilux-M 35mm f/1.4", "Summicron-M 50mm f/2"] },
  { model: "Hasselblad X2D 100C", lenses: ["XCD 45mm f/4 P", "XCD 90mm f/3.2"] },
];

async function main() {
  console.log("🌱 Seeding Aperio production…");
  for (const table of [
    certificates, orderItems, orders, collectionPhotos, collections, likes,
    photoTags, photos, sessions, emailVerifications, tags, printsConfig, mounts, categories, users,
  ]) await db.delete(table);
  console.log("  ✓ wiped");

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const [uAdmin, ...uRest] = await db.insert(users).values([
    { name: "Studio Aperio", email: "admin@aperio.gallery", passwordHash: hash("admin123"), role: "admin", location: "Madagascar", bio: "Direction de la galerie.", emailVerified: true },
    ...PHOTOGRAPHERS.map((p) => ({
      name: p.name, email: p.email, passwordHash: hash("photo123"), role: "photographer" as const,
      location: p.location, bio: p.bio, instagram: p.instagram, emailVerified: true,
      ...(p.specialties ? { specialties: p.specialties } : {}),
    })),
    { name: "Oliver Grant", email: "buyer@aperio.gallery", passwordHash: hash("buyer123"), role: "buyer", location: "Londres, UK", bio: "Collectionneur de tirages limités.", emailVerified: true },
    { name: "Maya Lindström", email: "maya@aperio.gallery", passwordHash: hash("buyer123"), role: "buyer", location: "Göteborg, Suède", bio: "Architecte d'intérieur.", emailVerified: true },
  ]).returning();

  const photographers = uRest.filter((u) => u.role === "photographer");
  const buyers = uRest.filter((u) => u.role === "buyer");
  /* Artisans : photographes dont la spécialité ou la bio touchent l'artisanat */
  const artisans = photographers.filter((u) => (u.specialties?.includes("artisanat") || u.specialties?.includes("sculpture") || u.specialties?.includes("tissage") || u.location === "Ambositra"));
  console.log(`  ✓ ${1 + photographers.length + buyers.length} users (${artisans.length} artisans)`);

  /* categories */
  const insertedCategories = await db.insert(categories).values(CATEGORIES.map((c) => ({
    name: c.name, slug: c.slug, description: c.desc, kind: c.kind, icon: c.icon,
    coverUrl: c.cover, sort: c.sort,
  }))).returning();
  const catBySlug = new Map(insertedCategories.map((c) => [c.slug, c]));
  console.log(`  ✓ ${insertedCategories.length} categories`);

  /* tags */
  const allTags = new Set<string>();
  Object.values(TAGS_BY_CAT).forEach((list) => list.forEach((t) => allTags.add(t)));
  const insertedTags = await db.insert(tags).values([...allTags].map((t) => ({ name: t, slug: slugify(t) }))).returning();
  const tagBySlug = new Map(insertedTags.map((t) => [t.slug, t]));
  console.log(`  ✓ ${insertedTags.length} tags`);

  /* prints config + mounts */
  await db.insert(printsConfig).values([
    { label: "20 × 30 cm", widthCm: 20, heightCm: 30, multiplier: "0.55", sort: 1 },
    { label: "30 × 45 cm", widthCm: 30, heightCm: 45, multiplier: "1.00", sort: 2 },
    { label: "40 × 60 cm", widthCm: 40, heightCm: 60, multiplier: "1.45", sort: 3 },
    { label: "60 × 90 cm", widthCm: 60, heightCm: 90, multiplier: "2.20", sort: 4 },
    { label: "80 × 120 cm", widthCm: 80, heightCm: 120, multiplier: "3.10", sort: 5 },
    { label: "100 × 150 cm", widthCm: 100, heightCm: 150, multiplier: "4.25", sort: 6 },
  ]);
  await db.insert(mounts).values([
    { name: "Tirage d'art", code: "art-print", description: "Papier fine art mat 200 g/m² d'archives", multiplier: "1.00", surcharge: "0", sort: 1 },
    { name: "Dibond aluminium", code: "dibond", description: "Composite aluminium 3 mm, finition mate", multiplier: "1.35", surcharge: "0", sort: 2 },
    { name: "Encadré", code: "framed", description: "Cadre galerie chêne ou noir mat + verre", multiplier: "1.60", surcharge: "35", sort: 3 },
    { name: "Verre acrylique", code: "acrylic", description: "Face-mount acrylique musée anti-reflet", multiplier: "1.85", surcharge: "60", sort: 4 },
  ]);
  console.log("  ✓ 6 sizes, 4 mounts");

  /* helpers */
  function buildExif() {
    const cam = pick(CAMERAS); const lens = pick(cam.lenses);
    const focal = parseFloat((lens.match(/(\d+)mm/) ?? ["", "35"])[1]);
    return {
      camera: cam.model, lens,
      iso: pick([100, 200, 400, 800, 1600, 3200]),
      focalLength: `${focal}mm`,
      aperture: `f/${pick([1.8, 2, 2.8, 4, 5.6, 8, 11])}`,
      shutterSpeed: pick(["1/2000s", "1/500s", "1/125s", "1/60s", "1/30s"]),
      takenAt: new Date(Date.now() - randInt(30, 600) * 86400000).toISOString().slice(0, 10),
    };
  }
  const takenSlugs = new Set<string>();
  function makeSlug(title: string): string {
    let s = slugify(title);
    if (takenSlugs.has(s)) s = `${s}-${randomUUID().slice(0, 6)}`;
    takenSlugs.add(s); return s;
  }
  const photoValues: (typeof photos.$inferInsert)[] = [];
  let counter = 0;

  function addPhoto(opts: {
    catSlug: string; licenseType: "free" | "limited";
    photographerId: number; mgaPrice?: number; totalEditions: number | null;
    orientation?: "landscape" | "portrait" | "square";
    featured?: boolean; imageUrl?: string;
  }) {
    const { catSlug, licenseType, photographerId, totalEditions } = opts;
    const pool = LOCAL_IMAGES[catSlug] ?? LOCAL_IMAGES["nature-landscapes"];
    const imageUrl = opts.imageUrl ?? pool[counter % pool.length];
    const motif = motifKey(imageUrl);
    const orientation = opts.orientation ?? pick(["landscape", "landscape", "portrait", "portrait", "square"] as const);
    const [w, h] = orientation === "landscape" ? [1600, 1067] : orientation === "portrait" ? [1067, 1600] : [1200, 1200];
    const title = pick(EDITORIAL[motif] ?? ["L'Île Rouge en lumière"]);
    const artisan = pick(ARTISAN_DESC[motif] ?? ["Tirage d'art de la galerie Aperio, numéroté et certifié."]);
    const mga = opts.mgaPrice ?? (licenseType === "limited" ? randInt(...(MGA_PRICE[motif] ?? [100000, 400000])) : 0);
    const basePriceEur = mgaToEur(mga);
    counter++;
    photoValues.push({
      title, slug: makeSlug(title),
      description: artisan,
      imageUrl, thumbUrl: imageUrl, width: w, height: h, orientation,
      color: pick(["#2F3E46", "#B23A48", "#3A5A40", "#CA6702", "#0077B6", "#9B5DE5", "#D62828", "#1D3557", "#F4A261", "#2A9D8F"]),
      licenseType, categoryId: catBySlug.get(catSlug)?.id ?? null,
      photographerId, basePrice: String(basePriceEur),
      totalEditions, availableStock: totalEditions !== null ? randInt(1, Math.max(1, totalEditions)) : null,
      exif: buildExif(),
      downloads: 0, views: 0, likesCount: 0,
      featured: opts.featured ?? (Math.random() < (licenseType === "limited" ? 0.18 : 0.06)),
      isPublished: true,
    });
  }

  /* World distribution (non-Madagascar): 600 photos */
  const worldFree: [string, number][] = [
    ["nature-landscapes", 40], ["urban-architecture", 40], ["wildlife", 35],
    ["people", 40], ["travel", 40], ["street", 30], ["abstract", 25],
    ["macro", 25], ["fine-art-still-life", 25], ["aerial", 30],
  ];
  const worldArt: [string, number][] = [
    ["nature-landscapes", 25], ["urban-architecture", 20],
    ["abstract", 25], ["macro", 20],
    ["fine-art-still-life", 25], ["aerial", 15],
  ];
  for (const [slug, count] of worldFree) {
    for (let i = 0; i < count; i++) addPhoto({ catSlug: slug, licenseType: "free", photographerId: pick(photographers).id, totalEditions: null });
  }
  for (const [slug, count] of worldArt) {
    for (let i = 0; i < count; i++) addPhoto({ catSlug: slug, licenseType: "limited", photographerId: pick(photographers).id, totalEditions: pick([8, 10, 15, 20, 25, 30, 40, 50]) });
  }

  /* Madagascar — 400+ photos (libres) */
  const mgFreeCount = 400;
  for (let i = 0; i < mgFreeCount; i++) {
    const isMalagasy = Math.random() < 0.6;
    const malagasyPool = photographers.filter((p) => ["Madagascar", "Morondava", "Nosy Be", "Ranomafana", "Antsirabe", "Antananarivo", "Toamasina", "Toliara", "Fianarantsoa", "Mahajanga", "Diego Suarez", "Ihosy", "Sainte-Marie", "Andringitra", "Ambositra"].includes(p.location ?? ""));
    const photographer = isMalagasy && malagasyPool.length ? pick(malagasyPool) : pick(photographers);
    addPhoto({ catSlug: "madagascar", licenseType: "free", photographerId: photographer.id, totalEditions: null });
  }

  /* Madagascar — éditions limitées */
  const mgArtCount = 80;
  for (let i = 0; i < mgArtCount; i++) {
    addPhoto({ catSlug: "madagascar", licenseType: "limited", photographerId: pick(photographers).id, totalEditions: pick([8, 10, 15, 20, 25, 30, 40, 50]) });
  }

  /* Artisanat Malgache — éditions limitées avec attribution aux artisans */
  const artisanDefs: [number, number][] = [
    [12, 15], // weave-ambositra count, total editions max
    [14, 20], // sculpture-ambositra
    [12, 15], // lamba
    [10, 12], // portrait (ateliers)
  ];
  let ai = 0;
  for (const [count, maxEd] of artisanDefs) {
    for (let i = 0; i < count; i++) {
      const artisan = artisans.length ? artisans[ai % artisans.length] : pick(photographers);
      ai++;
      addPhoto({ catSlug: "artisanat", licenseType: "limited", photographerId: artisan.id, totalEditions: pick([8, 10, 12, 15, 20].filter((e) => e <= maxEd)) });
    }
  }

  const insertedPhotos = await db.insert(photos).values(photoValues).returning();
  const mgCount = insertedPhotos.filter((p) => p.categoryId === catBySlug.get("madagascar")!.id).length;
  const artCount = insertedPhotos.filter((p) => p.categoryId === catBySlug.get("artisanat")!.id).length;
  console.log(`  ✓ ${insertedPhotos.length} photos (${mgCount} Madagascar, ${artCount} Artisanat)`);

  /* tags */
  const photoTagValues: Array<{ photoId: number; tagId: number }> = [];
  for (const p of insertedPhotos) {
    const catSlug = [...catBySlug.entries()].find(([, c]) => c.id === p.categoryId)?.[0] ?? "nature-landscapes";
    const pool = TAGS_BY_CAT[catSlug] ?? [];
    if (pool.length === 0) continue;
    const chosen = new Set<string>();
    const count = randInt(3, 5);
    while (chosen.size < count) chosen.add(pick(pool));
    for (const name of chosen) {
      const tag = tagBySlug.get(slugify(name));
      if (tag) photoTagValues.push({ photoId: p.id, tagId: tag.id });
    }
  }
  await db.insert(photoTags).values(photoTagValues);
  console.log(`  ✓ ${photoTagValues.length} photo-tag links`);

  /* Demo orders — NO fake likes/collections for new users */
  const limitedPhotos = insertedPhotos.filter((p) => p.licenseType === "limited" && (p.availableStock ?? 0) >= 1);
  const sizes = await db.select().from(printsConfig).orderBy(printsConfig.sort);
  const mountRows = await db.select().from(mounts).orderBy(mounts.sort);
  const size = sizes[2]; const mount = mountRows[1];

  const demoDefs: Array<{ num: string; status: "paid" | "shipped"; items: number }> = [
    { num: "APR-2026-100001", status: "paid", items: 1 },
    { num: "APR-2026-100002", status: "shipped", items: 2 },
  ];
  for (const def of demoDefs) {
    let subtotal = 0;
    const items: Array<Omit<typeof orderItems.$inferInsert, "orderId">> = [];
    for (let i = 0; i < def.items; i++) {
      const photo = limitedPhotos[i % limitedPhotos.length];
      const base = parseFloat(photo.basePrice);
      const sold = (photo.totalEditions ?? 0) - (photo.availableStock ?? 0);
      const unit = computeUnitPrice(base, size.multiplier, mount.multiplier, mount.surcharge);
      subtotal += unit;
      items.push({ photoId: photo.id, printConfigId: size.id, mountId: mount.id, editionNumber: sold + 1, quantity: 1, unitPrice: String(unit), lineTotal: String(unit) });
    }
    const shipping = subtotal >= 500 ? 0 : 24;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const [order] = await db.insert(orders).values({
      orderNumber: def.num, userId: buyers[0].id, status: def.status,
      subtotal: String(subtotal), shipping: String(shipping), tax: String(tax),
      total: String(subtotal + shipping + tax), currency: "EUR",
      paymentMethod: "card", paymentProvider: "stripe",
      shipName: buyers[0].name, shipEmail: buyers[0].email,
      shipAddress: { line1: "12 Baker Street", city: "London", zip: "W1U 3BW", country: "United Kingdom" },
    }).returning();
    for (const item of items) {
      const [oi] = await db.insert(orderItems).values({ ...item, orderId: order.id }).returning();
      await db.insert(certificates).values({
        orderItemId: oi.id, photoId: oi.photoId,
        serialNumber: `APR-${new Date().getFullYear()}-${String(def.items === 1 ? 1001 : 1002)}-${String(oi.editionNumber).padStart(3, "0")}`,
        watermarkHash: randomUUID().replace(/-/g, "").toUpperCase().slice(0, 32),
      });
      const ph = limitedPhotos.find((p) => p.id === item.photoId);
      if (ph) await db.update(photos).set({ availableStock: Math.max(0, (ph.availableStock ?? 1) - 1) }).where(eq(photos.id, item.photoId));
    }
  }
  console.log("  ✓ 2 demo orders + certificates");
  console.log("\n✅ Seeding complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
