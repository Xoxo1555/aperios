const fs = require("fs");
const path = "scripts/seed.ts";
let src = fs.readFileSync(path, "utf8");

// 1) Remplace tout le bloc LOCAL_IMAGES
const newLocalImages = `const LOCAL_IMAGES: Record<string, string[]> = {
  "nature-landscapes": [
    "/images/isalo.jpg",
    "/images/madagascar/andringitra-1.jpg",
    "/images/categories/mountain-1.jpg",
  ],
  "urban-architecture": ["/images/madagascar/tana-1.jpg"],
  wildlife: [
    "/images/madagascar/lemur-1.jpg",
    "/images/madagascar/lemur-3.jpg",
    "/images/madagascar/lemur-4.jpg",
    "/images/madagascar/chameleon-1.jpg",
    "/images/madagascar/chameleon-2.jpg",
  ],
  people: ["/images/madagascar/tana-1.jpg"],
  travel: [
    "/images/madagascar/baobab-3.jpg",
    "/images/categories/coast-2.jpg",
    "/images/madagascar/isalo-1.jpg",
  ],
  food: ["/images/madagascar/tana-1.jpg"],
  technology: ["/images/madagascar/tana-1.jpg"],
  sports: ["/images/madagascar/andringitra-1.jpg"],
  fashion: ["/images/art/sculpture-1.jpg", "/images/madagascar/tana-1.jpg"],
  street: ["/images/madagascar/tana-1.jpg"],
  abstract: ["/images/madagascar/tsingy-1.jpg", "/images/art/sculpture-1.jpg"],
  macro: [
    "/images/madagascar/chameleon-1.jpg",
    "/images/madagascar/chameleon-2.jpg",
    "/images/madagascar/lemur-4.jpg",
  ],
  "fine-art-still-life": ["/images/art/sculpture-1.jpg"],
  aerial: ["/images/isalo.jpg", "/images/categories/coast-2.jpg"],
  madagascar: [
    "/images/madagascar/andringitra-1.jpg",
    "/images/madagascar/baobab-3.jpg",
    "/images/madagascar/lemur-1.jpg",
    "/images/madagascar/lemur-3.jpg",
    "/images/madagascar/lemur-4.jpg",
    "/images/madagascar/chameleon-1.jpg",
    "/images/madagascar/chameleon-2.jpg",
    "/images/madagascar/tsingy-1.jpg",
    "/images/madagascar/tana-1.jpg",
    "/images/madagascar/isalo-1.jpg",
    "/images/isalo.jpg",
    "/images/art/sculpture-1.jpg",
  ],
  "malagasy-craft": ["/images/art/sculpture-1.jpg"],
  "malagasy-art": ["/images/art/sculpture-1.jpg"],
};`;

src = src.replace(/const LOCAL_IMAGES[\s\S]*?\n};/, newLocalImages);

// 2) Corrige les 4 chemins de coverUrl inexistants
src = src
  .replace('"/images/madagascar/baobab-1.jpg"', '"/images/madagascar/baobab-3.jpg"')
  .replace('"/images/art/lamba-weave-1.jpg" : LOCAL_IMAGES', '"/images/art/sculpture-1.jpg" : LOCAL_IMAGES')
  .replace('"/images/madagascar/nosybe-1.jpg"\n           : c.slug === "urban-architecture"', '"/images/categories/coast-2.jpg"\n           : c.slug === "urban-architecture"')
  .replace('"/images/madagascar/ranomafana-1.jpg"', '"/images/madagascar/chameleon-1.jpg"');

fs.writeFileSync(path, src, "utf8");
console.log("scripts/seed.ts mis à jour.");