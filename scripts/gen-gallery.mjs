// scripts/gen-gallery.mjs
// Générateur de visuels "galerie d'art" thématiques Madagascar (SVG autonomes).
// Aucune dépendance réseau : chaque fichier est un composant vectoriel original
// représentant un motif du patrimoine malgache (baobabs, lémuriens, artisanat
// d'Ambositra, portraits, faune, paysages…). Sortie : public/images/gallery/.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "images", "gallery");
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ */
/*  Palettes — ariary terreux, or, vert forêt, océan indien            */
/* ------------------------------------------------------------------ */
const P = {
  terre: "#9c3a25",
  terreClair: "#c86a3c",
  or: "#c79a3a",
  orClair: "#e6c372",
  vert: "#2f5d4f",
  vertClair: "#5c8a6f",
  ocean: "#1f6f8b",
  oceanClair: "#6fb6c9",
  nuit: "#221826",
  sable: "#e7d3b1",
  rose: "#d98a7a",
  encre: "#2b2330",
  ivoire: "#f3ead7",
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;
}

function grad(id, c1, c2, vertical = true) {
  const coords = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `<linearGradient id="${id}" ${coords}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
}

function radial(id, c1, c2) {
  return `<radialGradient id="${id}" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
}

/* ------------------------------------------------------------------ */
/*  Motifs                                                             */
/* ------------------------------------------------------------------ */
function sky(w, h, id, top, bottom) {
  return `<rect width="${w}" height="${h}" fill="url(#${id})"/>`;
}

function baobab(w, h, r) {
  const cx = w * (0.35 + r() * 0.3);
  const baseY = h * 0.92;
  const trunkW = w * 0.05;
  const topY = h * (0.3 + r() * 0.1);
  const branches = Array.from({ length: 5 }, () => {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.4;
    const len = h * (0.12 + r() * 0.1);
    const ex = cx + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len;
    return `<path d="M${cx} ${topY} Q${(cx + ex) / 2 + (r() - 0.5) * 40} ${topY - 30} ${ex} ${ey}" stroke="${P.encre}" stroke-width="${trunkW * 0.5}" fill="none" opacity="0.85"/>`;
  }).join("");
  const canopy = Array.from({ length: 6 }, () => {
    const ox = cx + (r() - 0.5) * w * 0.22;
    const oy = topY - h * 0.02 + (r() - 0.5) * h * 0.08;
    const rad = w * (0.07 + r() * 0.06);
    return `<circle cx="${ox}" cy="${oy}" r="${rad}" fill="${P.vert}" opacity="${0.75 + r() * 0.2}"/>`;
  }).join("");
  return `
    ${branches}
    <rect x="${cx - trunkW / 2}" y="${topY}" width="${trunkW}" height="${baseY - topY}" fill="${P.encre}"/>
    ${canopy}`;
}

function lemur(w, h, r) {
  const cx = w * 0.5;
  const cy = h * 0.55;
  const body = `<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.16}" ry="${h * 0.22}" fill="${P.ivoire}"/>
    <circle cx="${cx}" cy="${cy - h * 0.2}" r="${w * 0.1}" fill="${P.ivoire}"/>
    <circle cx="${cx - w * 0.03}" cy="${cy - h * 0.22}" r="${w * 0.018}" fill="${P.encre}"/>
    <circle cx="${cx + w * 0.03}" cy="${cy - h * 0.22}" r="${w * 0.018}" fill="${P.encre}"/>
    <path d="M${cx - w * 0.04} ${cy - h * 0.16} Q${cx} ${cy - h * 0.13} ${cx + w * 0.04} ${cy - h * 0.16}" stroke="${P.encre}" stroke-width="3" fill="none"/>`;
  const stripes = Array.from({ length: 7 }, (_, i) => {
    const x = cx - w * 0.18 + i * (w * 0.36 / 6);
    return `<rect x="${x}" y="${cy + h * 0.18}" width="${w * 0.018}" height="${h * 0.14}" fill="${i % 2 ? P.encre : P.ivoire}"/>`;
  }).join("");
  const tail = `<path d="M${cx + w * 0.14} ${cy + h * 0.05} q${w * 0.25} ${-h * 0.05} ${w * 0.3} ${h * 0.18}" stroke="${P.encre}" stroke-width="${w * 0.02}" fill="none"/>` +
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 9;
      const tx = cx + w * 0.14 + t * w * 0.3;
      const ty = cy + h * 0.05 - t * h * 0.05 * 2 + t * t * h * 0.18 * 2;
      return `<circle cx="${tx}" cy="${ty}" r="${w * 0.012}" fill="${i % 2 ? P.encre : P.ivoire}"/>`;
    }).join("");
  return body + stripes + tail;
}

function tsingy(w, h, r) {
  const out = [];
  for (let i = 0; i < 18; i++) {
    const x = (i / 18) * w + r() * 20;
    const ww = w * (0.03 + r() * 0.05);
    const hh = h * (0.25 + r() * 0.45);
    const shade = i % 2 ? P.terre : P.terreClair;
    out.push(`<path d="M${x} ${h} L${x + ww / 2} ${h - hh} L${x + ww} ${h} Z" fill="${shade}" opacity="${0.7 + r() * 0.3}"/>`);
    out.push(`<path d="M${x + ww / 2} ${h - hh} l${ww * 0.2} ${hh * 0.15} l${-ww * 0.2} ${hh * 0.1} z" fill="${P.or}" opacity="0.5"/>`);
  }
  return out.join("");
}

function weave(w, h, r) {
  const cols = 10, rows = 14;
  const cw = w / cols, ch = h / rows;
  let out = "";
  const palette = [P.terre, P.or, P.vert, P.ocean, P.ivoire, P.rose];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = palette[(x + y) % palette.length];
      out += `<rect x="${x * cw}" y="${y * ch}" width="${cw}" height="${ch}" fill="${c}" opacity="${0.78 + r() * 0.2}"/>`;
    }
  }
  // tissage : chevrons
  for (let y = 0; y < rows; y++) {
    const yy = y * ch + ch / 2;
    out += `<path d="M0 ${yy} L${w / 2} ${yy - ch * 0.4} L${w} ${yy}" stroke="${P.encre}" stroke-width="2" fill="none" opacity="0.25"/>`;
  }
  return out;
}

function portrait(w, h, r) {
  const cx = w * 0.5;
  const cy = h * 0.42;
  const face = `<circle cx="${cx}" cy="${cy}" r="${w * 0.18}" fill="${P.sable}"/>
    <path d="M${cx} ${cy + w * 0.16} q${w * 0.16} ${h * 0.18} ${-w * 0.16} ${h * 0.32} q${-w * 0.16} ${-h * 0.14} ${-w * 0.16} ${-h * 0.32} z" fill="${P.sable}"/>
    <ellipse cx="${cx - w * 0.07}" cy="${cy - w * 0.02}" rx="${w * 0.022}" ry="${w * 0.03}" fill="${P.encre}"/>
    <ellipse cx="${cx + w * 0.07}" cy="${cy - w * 0.02}" rx="${w * 0.022}" ry="${w * 0.03}" fill="${P.encre}"/>
    <path d="M${cx - w * 0.05} ${cy + w * 0.07} Q${cx} ${cy + w * 0.11} ${cx + w * 0.05} ${cy + w * 0.07}" stroke="${P.terre}" stroke-width="3" fill="none"/>`;
  const coiff = `<path d="M${cx - w * 0.2} ${cy - w * 0.05} q${w * 0.2} ${-w * 0.34} ${w * 0.4} 0 q${-w * 0.05} ${-w * 0.12} ${-w * 0.2} ${-w * 0.05} z" fill="${P.encre}"/>`;
  const lamba = `<path d="M${cx - w * 0.26} ${h * 0.86} L${cx + w * 0.26} ${h * 0.86} L${cx + w * 0.34} ${h} L${cx - w * 0.34} ${h} z" fill="${P.or}" opacity="0.9"/>` +
    Array.from({ length: 5 }, (_, i) => `<rect x="${cx - w * 0.34}" y="${h * 0.88 + i * h * 0.025}" width="${w * 0.68}" height="${h * 0.008}" fill="${i % 2 ? P.terre : P.vert}"/>`).join("");
  return face + coiff + lamba;
}

function canyon(w, h, r) {
  const layers = [
    { c: P.terreClair, y: h * 0.55, op: 0.9 },
    { c: P.terre, y: h * 0.68, op: 0.95 },
    { c: P.encre, y: h * 0.82, op: 1 },
  ];
  let out = "";
  for (const L of layers) {
    let d = `M0 ${L.y}`;
    for (let x = 0; x <= w; x += w / 8) {
      d += ` L${x} ${L.y - r() * h * 0.08} L${x + w / 16} ${L.y + r() * h * 0.05}`;
    }
    d += ` L${w} ${h} L0 ${h} Z`;
    out += `<path d="${d}" fill="${L.c}" opacity="${L.op}"/>`;
  }
  return out;
}

function chameleon(w, h, r) {
  const cx = w * 0.5, cy = h * 0.55;
  const body = `<path d="M${cx - w * 0.22} ${cy} q${w * 0.3} ${-h * 0.22} ${w * 0.42} ${h * 0.02} q${w * 0.06} ${h * 0.1} ${-w * 0.05} ${h * 0.12} q${-w * 0.25} ${h * 0.06} ${-w * 0.37} ${-h * 0.16} z" fill="${P.vert}" opacity="0.92"/>`;
  const head = `<circle cx="${cx + w * 0.2}" cy="${cy - h * 0.06}" r="${w * 0.07}" fill="${P.vertClair}"/>`;
  const eye = `<circle cx="${cx + w * 0.22}" cy="${cy - h * 0.06}" r="${w * 0.02}" fill="${P.or}"/>`;
  const tail = `<path d="M${cx - w * 0.22} ${cy} q${-w * 0.12} ${h * 0.05} ${-w * 0.05} ${h * 0.14} q${w * 0.04} ${h * 0.06} ${w * 0.02} ${-h * 0.02}" stroke="${P.vert}" stroke-width="${w * 0.025}" fill="none"/>`;
  const spots = Array.from({ length: 14 }, () => `<circle cx="${cx - w * 0.18 + r() * w * 0.34}" cy="${cy - h * 0.1 + r() * h * 0.18}" r="${w * 0.012}" fill="${P.or}" opacity="0.8"/>`).join("");
  return body + tail + head + eye + spots;
}

function terraces(w, h, r) {
  let out = `<rect width="${w}" height="${h}" fill="${P.vertClair}" opacity="0.4"/>`;
  for (let i = 0; i < 22; i++) {
    const y = h * 0.2 + i * (h * 0.035);
    const amp = w * (0.04 + r() * 0.05);
    let d = `M0 ${y}`;
    for (let k = 0; k <= 10; k++) {
      const x = (k / 10) * w;
      const yy = y + Math.sin(k * 0.9 + i) * amp;
      d += ` L${x} ${yy}`;
    }
    const c = i % 2 ? P.vert : P.sable;
    out += `<path d="${d}" stroke="${c}" stroke-width="${h * 0.018}" fill="none" opacity="0.85"/>`;
  }
  return out;
}

function beach(w, h, r) {
  const sea = `<path d="M0 ${h * 0.3} Q${w * 0.5} ${h * 0.22} ${w} ${h * 0.3} L${w} ${h * 0.62} L0 ${h * 0.62} Z" fill="${P.ocean}"/>`;
  const waves = Array.from({ length: 5 }, (_, i) => `<path d="M0 ${h * (0.36 + i * 0.05)} Q${w * 0.5} ${h * (0.32 + i * 0.05)} ${w} ${h * (0.36 + i * 0.05)}" stroke="${P.oceanClair}" stroke-width="2" fill="none" opacity="0.6"/>`).join("");
  const sand = `<path d="M0 ${h * 0.6} L${w} ${h * 0.6} L${w} ${h} L0 ${h} Z" fill="${P.sable}"/>`;
  const palm = `<path d="M${w * 0.78} ${h} L${w * 0.8} ${h * 0.5}" stroke="${P.encre}" stroke-width="${w * 0.02}"/>` +
    Array.from({ length: 6 }, (_, i) => `<path d="M${w * 0.8} ${h * 0.5} Q${w * 0.8 + Math.cos(i) * w * 0.12} ${h * 0.4} ${w * 0.8 + Math.cos(i) * w * 0.16} ${h * 0.46}" stroke="${P.vert}" stroke-width="4" fill="none"/>`).join("");
  const sun = `<circle cx="${w * 0.25}" cy="${h * 0.18}" r="${w * 0.06}" fill="${P.orClair}" opacity="0.9"/>`;
  return sky(w, h, "bsky", P.oceanClair, P.sable) + sea + waves + sand + palm + sun;
}

function mountains(w, h, r) {
  const m = (c, y, op) => {
    let d = `M0 ${y}`;
    let x = 0;
    while (x < w) {
      const peak = y - h * (0.1 + r() * 0.3);
      d += ` L${x + w * 0.08} ${peak} L${x + w * 0.16} ${y}`;
      x += w * 0.16;
    }
    d += ` L${w} ${h} L0 ${h} Z`;
    return `<path d="${d}" fill="${c}" opacity="${op}"/>`;
  };
  return sky(w, h, "msky", P.orClair, P.terreClair) + m(P.vert, h * 0.7, 0.9) + m(P.encre, h * 0.82, 1) + `<circle cx="${w * 0.7}" cy="${h * 0.22}" r="${w * 0.05}" fill="${P.or}" opacity="0.85"/>`;
}

function forest(w, h, r) {
  let out = `<rect width="${w}" height="${h}" fill="${P.vert}"/>`;
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = h * (0.4 + r() * 0.6), hh = h * (0.1 + r() * 0.3), ww = w * (0.01 + r() * 0.02);
    out += `<rect x="${x}" y="${y - hh}" width="${ww}" height="${hh}" fill="${i % 3 ? P.vertClair : P.encre}" opacity="${0.5 + r() * 0.4}"/>`;
  }
  const mist = `<rect width="${w}" height="${h * 0.5}" fill="${P.ivoire}" opacity="0.12"/>`;
  return out + mist;
}

function textile(w, h, r) {
  const palette = [P.terre, P.or, P.vert, P.ocean, P.nuit, P.rose];
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += `<rect x="0" y="${(i / 16) * h}" width="${w}" height="${h / 16}" fill="${palette[i % palette.length]}" opacity="${0.8 + r() * 0.2}"/>`;
    if (i % 2 === 0) out += `<rect x="0" y="${(i / 16) * h}" width="${w}" height="${h / 16 * 0.3}" fill="${P.orClair}" opacity="0.5"/>`;
  }
  return out;
}

function woodcarving(w, h, r) {
  let out = `<rect width="${w}" height="${h}" fill="${P.encre}"/>`;
  out += `<rect x="${w * 0.12}" y="${h * 0.08}" width="${w * 0.76}" height="${h * 0.84}" rx="${w * 0.04}" fill="none" stroke="${P.or}" stroke-width="${w * 0.02}"/>`;
  // motifs géométriques Zafimaniry
  for (let i = 0; i < 5; i++) {
    const y = h * 0.18 + i * h * 0.15;
    let d = `M${w * 0.16} ${y}`;
    for (let k = 0; k <= 8; k++) {
      const x = w * 0.16 + (k / 8) * w * 0.68;
      d += ` L${x} ${y + (k % 2 ? h * 0.03 : -h * 0.03)}`;
    }
    out += `<path d="${d}" stroke="${P.orClair}" stroke-width="${w * 0.012}" fill="none"/>`;
  }
  out += `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.08}" fill="none" stroke="${P.or}" stroke-width="${w * 0.02}"/>`;
  return out;
}

function pirogue(w, h, r) {
  const water = `<rect width="${w}" height="${h}" fill="${P.ocean}"/>`;
  const waves = Array.from({ length: 8 }, (_, i) => `<path d="M0 ${h * (0.2 + i * 0.1)} Q${w * 0.25} ${h * (0.16 + i * 0.1)} ${w * 0.5} ${h * (0.2 + i * 0.1)} T${w} ${h * (0.2 + i * 0.1)}" stroke="${P.oceanClair}" stroke-width="2" fill="none" opacity="0.5"/>`).join("");
  const boat = `<path d="M${w * 0.3} ${h * 0.7} Q${w * 0.5} ${h * 0.8} ${w * 0.7} ${h * 0.7} L${w * 0.62} ${h * 0.78} Q${w * 0.5} ${h * 0.84} ${w * 0.38} ${h * 0.78} Z" fill="${P.encre}"/>` +
    `<rect x="${w * 0.48}" y="${h * 0.5}" width="${w * 0.02}" height="${h * 0.2}" fill="${P.or}"/>` +
    `<path d="M${w * 0.5} ${h * 0.5} q${w * 0.12} ${h * 0.04} 0 ${h * 0.14}" stroke="${P.ivoire}" stroke-width="3" fill="none"/>`;
  const sun = `<circle cx="${w * 0.5}" cy="${h * 0.3}" r="${w * 0.06}" fill="${P.orClair}" opacity="0.9"/>`;
  return water + waves + boat + sun;
}

function rova(w, h, r) {
  const sky2 = sky(w, h, "rsky", P.orClair, P.rose);
  const hill = `<path d="M0 ${h * 0.7} Q${w * 0.5} ${h * 0.6} ${w} ${h * 0.7} L${w} ${h} L0 ${h} Z" fill="${P.vert}"/>`;
  const palace = `<rect x="${w * 0.32}" y="${h * 0.42}" width="${w * 0.36}" height="${h * 0.3}" fill="${P.sable}"/>
    <path d="M${w * 0.3} ${h * 0.42} L${w * 0.5} ${h * 0.3} L${w * 0.7} ${h * 0.42} Z" fill="${P.terre}"/>
    <rect x="${w * 0.46}" y="${h * 0.5}" width="${w * 0.08}" height="${h * 0.22}" fill="${P.encre}"/>`;
  return sky2 + hill + palace;
}

function faune(w, h, r) {
  // oiseau / zébu stylisé
  const body = `<ellipse cx="${w * 0.45}" cy="${h * 0.55}" rx="${w * 0.2}" ry="${h * 0.14}" fill="${P.encre}"/>`;
  const head = `<circle cx="${w * 0.66}" cy="${h * 0.46}" r="${w * 0.06}" fill="${P.encre}"/>`;
  const horn = `<path d="M${w * 0.7} ${h * 0.42} q${w * 0.04} ${-h * 0.1} ${w * 0.02} ${-h * 0.16}" stroke="${P.or}" stroke-width="4" fill="none"/>`;
  const legs = `<rect x="${w * 0.4}" y="${h * 0.66}" width="4" height="${h * 0.16}" fill="${P.encre}"/><rect x="${w * 0.52}" y="${h * 0.66}" width="4" height="${h * 0.16}" fill="${P.encre}"/>`;
  return sky(w, h, "fsky", P.orClair, P.sable) + body + head + horn + legs;
}

/* ------------------------------------------------------------------ */
/*  Cartes de génération                                               */
/* ------------------------------------------------------------------ */
const SPEC = [
  { motif: baobab, name: "baobab", count: 4, orient: "landscape", sky: ["bsun", P.orClair, P.terre] },
  { motif: lemur, name: "lemur", count: 4, orient: "portrait" },
  { motif: tsingy, name: "tsingy", count: 3, orient: "landscape", sky: ["tny", P.orClair, P.terreClair] },
  { motif: weave, name: "weave-ambositra", count: 3, orient: "square" },
  { motif: portrait, name: "portrait", count: 4, orient: "portrait", sky: ["psky", P.orClair, P.rose] },
  { motif: canyon, name: "isalo", count: 3, orient: "landscape", sky: ["csky", P.orClair, P.terreClair] },
  { motif: chameleon, name: "chameleon", count: 3, orient: "landscape" },
  { motif: terraces, name: "rizieres", count: 3, orient: "landscape" },
  { motif: beach, name: "nosybe", count: 3, orient: "landscape" },
  { motif: mountains, name: "andringitra", count: 3, orient: "landscape" },
  { motif: forest, name: "ranomafana", count: 3, orient: "portrait" },
  { motif: textile, name: "lamba", count: 3, orient: "square" },
  { motif: woodcarving, name: "sculpture-ambositra", count: 3, orient: "portrait" },
  { motif: pirogue, name: "pirogue", count: 2, orient: "landscape" },
  { motif: rova, name: "rova", count: 2, orient: "landscape" },
  { motif: faune, name: "faune", count: 3, orient: "landscape" },
];

function dim(orient) {
  if (orient === "portrait") return [1067, 1600];
  if (orient === "square") return [1200, 1200];
  return [1600, 1067];
}

let total = 0;
for (const s of SPEC) {
  for (let i = 0; i < s.count; i++) {
    const [w, h] = dim(s.orient);
    const r = rng(s.name.length * 131 + i * 977 + 7);
    const defs = [];
    if (s.sky) defs.push(grad(s.sky[0], s.sky[1], s.sky[2]));
    let body = "";
    if (s.sky) body += sky(w, h, s.sky[0]);
    body += s.motif(w, h, r);
    const out = svg(w, h, `<defs>${defs.join("")}</defs>${body}`);
    const file = join(OUT, `${s.name}-${String(i + 1).padStart(2, "0")}.svg`);
    writeFileSync(file, out, "utf8");
    total++;
  }
}
console.log(`✓ ${total} visuels générés dans public/images/gallery/`);
