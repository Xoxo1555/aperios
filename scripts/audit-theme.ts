/**
 * Audit « thème » — lisibilité WCAG (contrastes) de TOUTES les routes du site,
 * en mode clair ET en mode sombre, à deux tailles d'écran.
 *
 * Règles appliquées :
 *   - NE cible QUE http://localhost:3000 (refus ferme de tout autre hôte).
 *   - Lecture seule : goto + evaluate + UN SEUL clic sur le bouton de thème
 *     (pour vérifier précisément qu'il fonctionne) — aucune autre interaction.
 *   - Aucun téléchargement de navigateur : ce script lance le Chrome installé
 *     via `channel: "chrome"`. playwright-core suffit.
 *   - WCAG 2.1 AA : ratio >= 4.5:1 (>= 3:1 si texte >= 24px, ou >= 18.66px
 *     en gras). Les fonds avec image (hero, photos) sont signalés « media » :
 *     le contraste y est vérifié manuellement sur les captures.
 *   - Thème sélectionné via localStorage posé avant le chargement (le script
 *     inline anti-FOUC de l'app le lit) — aucun patch du DOM définitif.
 *   - Captures d'écran écrites dans %TEMP%\opencode\theme-shots (hors du dépôt).
 *
 * Usage :
 *   npx tsx scripts/audit-theme.ts
 *   APERIO_REPORT_SUFFIX=avt npx tsx scripts/audit-theme.ts   (dossier vite)
 */
import { chromium } from "playwright-core";
import * as fs from "fs";
import * as path from "path";

const BASE = (process.env.APERIO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SUFFIX = process.env.APERIO_REPORT_SUFFIX ?? "run";
const SHOTS = process.env.APERIO_SHOTS_DIR
  ?? path.join(process.env.TEMP ?? "C:/Windows/Temp", "opencode", "theme-shots");

/* ------------------------------------------------------------------ */
/* Garde de sécurité AVANT toute connexion : hôte strictement local.    */
/* ------------------------------------------------------------------ */
{
  const host = new URL(BASE).hostname.toLowerCase();
  if (!(host === "localhost" || host === "127.0.0.1" || host === "::1")) {
    console.error(`[audit-theme] REFUS : la cible « ${BASE} » n'est pas locale (hôte="${host}").`);
    process.exit(2);
  }
}

const BUYER = { email: "buyer@aperio.gallery", password: "buyer123" };
const PHOTOGRAPHER = { email: "photographer@aperio.gallery", password: "photo123" };
const PHOTO_SLUG = "close-up-of-tree-bark-with-resin-droplets";

const PUBLIC_ROUTES = [
  "/", "/about", "/help", "/contact", "/terms", "/privacy", "/licenses",
  "/cookies", "/pricing", "/photos", "/photos?category=madagascar",
  "/prints", "/prints?category=malagasy-art", "/login", "/register",
  `/photo/${PHOTO_SLUG}`,
];
const BUYER_ROUTES = ["/profile", "/checkout", "/wallet", "/purchases", "/collections"];
const PHOTOGRAPHER_ROUTES = ["/dashboard", "/payout"];

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type Failure = {
  ratio: number; th: number; fg: string; bg: string; size: string; weight: string;
  tag: string; cls: string; text: string;
};
type Scan = { failures: Failure[]; media: number; theme: string | null };

interface RunRow {
  route: string; theme: string; viewport: string; width: number;
  ok: boolean; failures: number; media: number;
  worst: Failure | null;
  details: Failure[];
}

const rows: RunRow[] = [];

const log = (s: string) => console.log(`[audit-theme] ${s}`);

/* Injected once per context: forces the theme BEFORE any app script runs,
   the exact same way a user's saved preference would. */
function themeInitScript(theme: "light" | "dark") {
  return () => {
    try { localStorage.setItem("aperio-theme", theme); } catch { /* ignore */ }
  };
}

const WCAG_SCANNER = String.raw`
(function () {
  "use strict";
  const toLin = function (c) {
    const u = c / 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  };
  const luminance = function (r, g, b) {
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  };
  const clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  const linearToSrgb = function (u) { return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055; };
  const labT3 = function (t) { return t > 6 / 29 ? t * t * t : (3 * (6 / 29) * (6 / 29)) * (t - 4 / 29); };
  const labToRgba = function (L, a, b, alpha) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const X = 0.96422 * labT3(fx);
    const Y = 1 * labT3(fy);
    const Z = 0.82521 * labT3(fz);
    let r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z;
    let g = -0.9787684 * X + 1.9161415 * Y + 0.0334540 * Z;
    let bl = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z;
    if (r < 0) r = 0; else if (r > 1) r = 1;
    if (g < 0) g = 0; else if (g > 1) g = 1;
    if (bl < 0) bl = 0; else if (bl > 1) bl = 1;
    return {
      r: Math.round(linearToSrgb(r) * 255),
      g: Math.round(linearToSrgb(g) * 255),
      b: Math.round(linearToSrgb(bl) * 255),
      a: alpha
    };
  };
  const lchToRgba = function (L, C, H, alpha) {
    const hrad = (H * Math.PI) / 180;
    return labToRgba(L, C * Math.cos(hrad), C * Math.sin(hrad), alpha);
  };
  const oklabToSrgb = function (L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
      clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  };
  const oklabToRgba = function (L, a, b, alpha) {
    const lin = oklabToSrgb(L, a, b);
    return {
      r: Math.round(linearToSrgb(lin[0]) * 255),
      g: Math.round(linearToSrgb(lin[1]) * 255),
      b: Math.round(linearToSrgb(lin[2]) * 255),
      a: alpha
    };
  };
  const oklchToRgba = function (L, C, H, alpha) {
    const hrad = (H * Math.PI) / 180;
    return oklabToRgba(L, C * Math.cos(hrad), C * Math.sin(hrad), alpha);
  };
  const parseColor = function (s) {
    if (!s) return null;
    s = s.trim();
    let m;
    m = s.match(/^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
    m = s.match(/^rgb\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
    m = s.match(/^rgba?\(([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,]*\/?[\s]*([\d.]+%?))?\)$/);
    if (m) {
      const raw = m[4];
      const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      return { r: +m[1], g: +m[2], b: +m[3], a: a };
    }
    const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map(function (c) { return c + c; }).join("");
      const n = parseInt(h, 16);
      if (h.length === 6) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
      if (h.length === 8) return { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: (n & 255) / 255 };
    }
    m = s.match(/^oklch\(([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,]*\/?[\s]*([\d.]+%?))?\)$/);
    if (m) {
      const raw = m[4];
      const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      return oklchToRgba(+m[1], +m[2], +m[3], a);
    }
    m = s.match(/^oklab\(([\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)(?:[\s,]*\/?[\s]*([\d.]+%?))?\)$/);
    if (m) {
      const raw = m[4];
      const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      return oklabToRgba(+m[1], +m[2], +m[3], a);
    }
    m = s.match(/^lab\(([\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)(?:[\s,]*\/?[\s]*([\d.]+%?))?\)$/);
    if (m) {
      const raw = m[4];
      const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      return labToRgba(+m[1], +m[2], +m[3], a);
    }
    m = s.match(/^lch\(([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,]*\/?[\s]*([\d.]+%?))?\)$/);
    if (m) {
      const raw = m[4];
      const a = raw === undefined ? 1 : raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
      return lchToRgba(+m[1], +m[2], +m[3], a);
    }
    m = s.match(/^color\((srgb|srgb-linear)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
    if (m) {
      let r = +m[2];
      let g = +m[3];
      let b = +m[4];
      if (m[1].toLowerCase() === "srgb-linear") { r = linearToSrgb(r); g = linearToSrgb(g); b = linearToSrgb(b); }
      const a = m[5] === undefined ? 1 : parseFloat(m[5]);
      return { r: r * 255, g: g * 255, b: b * 255, a: a };
    }
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  };
  const blend = function (top, bot) {
    const a = top.a + bot.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a,
      g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a,
      b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a,
      a: a
    };
  };
  const toCss = function (c) {
    return "rgb(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + ")";
  };
  const threshold = function (px, w) { return (px >= 24 || (px >= 18.66 && w >= 700)) ? 3 : 4.5; };

  const mediaRects = [];
  document.querySelectorAll("img").forEach(function (img) {
    const r = img.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) mediaRects.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  });
  const overMedia = function (x, y, w, h) {
    if (w <= 0 || h <= 0) return false;
    return mediaRects.some(function (m) {
      const ix = Math.max(x, m.x);
      const iy = Math.max(y, m.y);
      const ix2 = Math.min(x + w, m.x + m.w);
      const iy2 = Math.min(y + h, m.y + m.h);
      if (ix2 <= ix || iy2 <= iy) return false;
      return ((ix2 - ix) * (iy2 - iy)) / (w * h) >= 0.5;
    });
  };

  const failures = [];
  let media = 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    const e = el;
    if (e instanceof SVGElement) continue;
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
    const tag = e.tagName.toLowerCase();
    const clsL = (typeof e.className === "string") ? e.className.toLowerCase() : "";
    if (clsL.indexOf("sr-only") >= 0 || clsL.indexOf("visually-hidden") >= 0) continue;
    if (e.getAttribute && /^(true|1)$/i.test(e.getAttribute("aria-hidden") || "")) continue;
    if (tag === "select") continue;
    if (tag === "input") {
      const ty = String(e.type || "text").toLowerCase();
      if (["checkbox", "radio", "file", "range", "color", "hidden", "button", "submit", "reset", "image"].indexOf(ty) >= 0) continue;
    }
    const isForm = tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
    let ownText = "";
    e.childNodes.forEach(function (n) {
      if (n.nodeType === Node.TEXT_NODE) ownText += n.textContent || "";
    });
    if (!ownText.trim() && !isForm) continue;
    const rect = e.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < -80 || rect.top > window.innerHeight + 80) continue;
    if (rect.right < -80 || rect.left > window.innerWidth + 80) continue;

    const color = parseColor(cs.color);
    if (!color || color.a === 0) continue;

    let bg = null;
    let node = e;
    let hasImage = overMedia(rect.x, rect.y, rect.width, rect.height);
    const stack = [];
    while (node && node !== document.documentElement) {
      const ncs = getComputedStyle(node);
      if (ncs.backgroundImage && ncs.backgroundImage !== "none") { hasImage = true; break; }
      const b = parseColor(ncs.backgroundColor);
      if (b && b.a > 0) stack.push(b);
      node = node.parentElement;
    }
    if (!hasImage && stack.length > 0) {
      /* Composition pile → origine (du plus profond au plus proche) */
      bg = stack[stack.length - 1];
      for (let i = stack.length - 2; i >= 0; i--) bg = blend(stack[i], bg);
    }
    if (hasImage || !bg || bg.a < 0.98) { media++; continue; }

    const finalFg = color.a < 1 ? blend(color, bg) : color;
    const l1 = luminance(finalFg.r, finalFg.g, finalFg.b);
    const l2 = luminance(bg.r, bg.g, bg.b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    if (lo === 0 && hi === 0) continue;
    const ratio = (hi + 0.05) / (lo + 0.05);
    const th = threshold(parseFloat(cs.fontSize) || 0, parseInt(cs.fontWeight, 10) || 400);
    if (ratio < th) {
      const cls = (typeof e.className === "string") ? e.className.slice(0, 140) : "";
      failures.push({
        ratio: Math.round(ratio * 100) / 100, th: th, fg: toCss(finalFg), bg: toCss(bg),
        size: cs.fontSize, weight: cs.fontWeight, tag: tag, cls: cls,
        text: (ownText || (e.innerText || "")).replace(/\\s+/g, " ").trim().slice(0, 60)
      });
    }
  }
  return {
    failures: failures,
    media: media,
    theme: document.documentElement.getAttribute("data-theme")
  };
})()
`;

async function loginCookies(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} → HTTP ${res.status}`);
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookies = setCookies.map((c) => {
    const nv = c.split(";")[0];
    const i = nv.indexOf("=");
    return { name: nv.slice(0, i), value: nv.slice(i + 1) };
  });
  if (!cookies.some((c) => c.name === "aperio_session")) throw new Error("pas de cookie aperio_session");
  return cookies;
}

function shotName(route: string, theme: string, vp: string, extra = "") {
  const safe = (route === "/" ? "home" : route).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe}__${theme}__${vp}${extra ? "__" + extra : ""}.png`;
}

async function scanRoute(
  page: import("playwright-core").Page,
  route: string,
  theme: "light" | "dark",
  vp: { name: string; width: number },
  auth: boolean,
) {
  const url = `${BASE}${route}`;
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(650);
  const scan = (await page.evaluate(WCAG_SCANNER)) as Scan;
  const failures = scan.failures;
  await page.screenshot({
    fullPage: true,
    path: path.join(SHOTS, SUFFIX, theme, `${vp.name}-${auth ? "auth-" : ""}${shotName(route, theme, vp.name)}`),
  });
  failures.sort((a, b) => a.ratio - b.ratio);
  const worst = failures[0] ?? null;
  rows.push({
    route, theme, viewport: vp.name, width: vp.width, ok: failures.length === 0,
    failures: failures.length, media: scan.media, worst,
    details: failures.slice(0, 40),
  });
  if (failures.length > 0) {
    log(`  ✗ ${route.padEnd(42)} ${theme.padEnd(5)} ${vp.name.padEnd(7)} → ${failures.length} contraste(s) KO  (pire ratio ${worst!.ratio}, seuil ${worst!.th}, ${worst!.text || worst!.tag})`);
  } else {
    log(`  ✓ ${route.padEnd(42)} ${theme.padEnd(5)} ${vp.name.padEnd(7)} → 0 (${scan.media} éléments sur image ignorés pour la statique)`);
  }
  return { scan, failures };
}

async function toggleCheck(page: import("playwright-core").Page) {
  const before = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    body: getComputedStyle(document.body).backgroundColor,
  }));
  const toggle = page.locator("button.ap-theme-toggle").filter({ visible: true }).first();
  const labelBefore = (await toggle.getAttribute("aria-label")) ?? "";
  await toggle.click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    body: getComputedStyle(document.body).backgroundColor,
  }));
  const labelAfter = (await page.locator("button.ap-theme-toggle").filter({ visible: true }).first().getAttribute("aria-label")) ?? "";
  const flipped = before.attr === "light" && after.attr === "dark";
  const bodyChanged = before.body !== after.body;
  const labelChanged = labelBefore !== labelAfter;
  return {
    ok: flipped && bodyChanged && labelChanged,
    beforeAttr: before.attr, afterAttr: after.attr,
    beforeBody: before.body, afterBody: after.body,
    labelChanged,
  };
}

async function main() {
  log(`Cible : ${BASE} (contrôlée locale).`);
  log(`Captures + rapport : ${path.join(SHOTS, SUFFIX)}`);

  const args = process.argv.slice(2);
  const argVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const onlyThemes = (argVal("--theme") || "light,dark").split(",");
  const onlyRoutes = (argVal("--only") || "*").split(",").filter(Boolean);

  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch((err) => {
    console.error(
      "[audit-theme] Impossible de lancer Chrome canal local (" + err.message + ").\n" +
      "Aucun navigateur ne sera téléchargé : utilise un Chrome installé (channel: \"chrome\").",
    );
    process.exit(3);
  });

  try {
    const buyerCookies = await loginCookies(BUYER.email, BUYER.password);
    const photographerCookies = await loginCookies(PHOTOGRAPHER.email, PHOTOGRAPHER.password);
    const domain = new URL(BASE).hostname;

    /* ---------- A) Bouton de thème : UN SEUL clic, vérification fonctionnelle ---------- */
    log("Test TOGGLE (un seul clic réel : clair → sombre)…");
    {
      const ctx = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        colorScheme: "light",
      });
      await ctx.addInitScript(themeInitScript("light"));
      await ctx.addCookies(buyerCookies.map((c) => ({ name: c.name, value: c.value, domain, path: "/" })));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
      /* Le data-theme est déjà posé au premier rendu (avant hydration) :
         c'est le script inline avantInteractive qui le pose. */
      const attrAtFirstPaint = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const beforeScan = (await page.evaluate(WCAG_SCANNER)) as Scan;
      const t = await toggleCheck(page);
      log(`  attribut data-theme au 1er rendu : ${attrAtFirstPaint} (attendu light)`);
      log(`  avant : data-theme=${t.beforeAttr} body=${t.beforeBody}  →  après : data-theme=${t.afterAttr} body=${t.afterBody}`);
      log(`  icône/aria du bouton synchronisée : ${t.labelChanged}`);
      if (t.ok && attrAtFirstPaint === "light" && beforeScan.theme === "light") {
        log("  ✓ LE BOUTON FONCTIONNE : un clic bascule <html data-theme> ET le fond de la page.");
      } else {
        console.error("[audit-theme] ✗ ÉCHEC du test bouton : le clic n'a pas (re)basculé le thème.");
        process.exitCode = 1;
      }
      await page.screenshot({ path: path.join(SHOTS, SUFFIX, "toggle", "after-click.png") });
      await page.close();
      await ctx.close();
    }

    /* ---------- B) Scan de toutes les routes × thèmes × tailles ---------- */
    for (const theme of onlyThemes.length === 1 && onlyThemes[0] === "none" ? [] : THEMES.filter((t) => onlyThemes.includes(t))) {
      for (const vp of VIEWPORTS) {
        log(`--- Thème « ${theme} », ${vp.name} (${vp.width}×${vp.height}) ---`);
        for (const route of PUBLIC_ROUTES) {
          if (!(onlyRoutes[0] === "*" || onlyRoutes.includes(route))) continue;
          const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme });
          await ctx.addInitScript(themeInitScript(theme));
          const page = await ctx.newPage();
          try {
            await scanRoute(page, route, theme, vp, false);
          } catch (err) {
            log(`  ✗ ${route} ERREUR : ${(err as Error).message}`);
            rows.push({ route, theme, viewport: vp.name, width: vp.width, ok: false, failures: -1, media: -1, worst: null, details: [] });
          }
          await page.close();
          await ctx.close();
        }
        /* Pages connectées (acheteur puis photographe) */
        for (const route of BUYER_ROUTES) {
          if (!(onlyRoutes[0] === "*" || onlyRoutes.includes(route))) continue;
          const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme });
          await ctx.addInitScript(themeInitScript(theme));
          await ctx.addCookies(buyerCookies.map((c) => ({ name: c.name, value: c.value, domain, path: "/" })));
          const page = await ctx.newPage();
          try {
            await scanRoute(page, route, theme, vp, true);
          } catch (err) {
            log(`  ✗ ${route} ERREUR : ${(err as Error).message}`);
            rows.push({ route, theme, viewport: vp.name, width: vp.width, ok: false, failures: -1, media: -1, worst: null, details: [] });
          }
          await page.close();
          await ctx.close();
        }
        for (const route of PHOTOGRAPHER_ROUTES) {
          if (!(onlyRoutes[0] === "*" || onlyRoutes.includes(route))) continue;
          const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme });
          await ctx.addInitScript(themeInitScript(theme));
          await ctx.addCookies(photographerCookies.map((c) => ({ name: c.name, value: c.value, domain, path: "/" })));
          const page = await ctx.newPage();
          try {
            await scanRoute(page, route, theme, vp, true);
          } catch (err) {
            log(`  ✗ ${route} ERREUR : ${(err as Error).message}`);
            rows.push({ route, theme, viewport: vp.name, width: vp.width, ok: false, failures: -1, media: -1, worst: null, details: [] });
          }
          await page.close();
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  /* ---------- Synthèse ---------- */
  const stdout: string[] = [];
  const okCount = rows.filter((r) => r.ok).length;
  const bad = rows.filter((r) => !r.ok);
  stdout.push("");
  stdout.push("=".repeat(92));
  stdout.push(`SYNTHÈSE — routes × thèmes × tailles : ${rows.length} | OK ${okCount} | KO ${bad.length} | échec total : ${bad.reduce((s, r) => s + Math.max(r.failures, 0), 0)}`);
  stdout.push("=".repeat(92));
  stdout.push("route".padEnd(42) + "thème ".padEnd(7) + "vue".padEnd(8) + "résultat");
  for (const r of rows) {
    const label = r.ok ? "OK" : `KO(${r.failures})`;
    stdout.push(`${r.route.padEnd(42)}${r.theme.padEnd(7)}${r.viewport.padEnd(8)}${label}`);
  }
  stdout.push("");

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    suffix: SUFFIX,
    totals: { runs: rows.length, ok: okCount, ko: bad.length, failures: bad.reduce((s, r) => s + Math.max(r.failures, 0), 0) },
    rows,
    worst: bad.filter((r) => r.worst).slice().sort((a, b) => a.worst!.ratio - b.worst!.ratio).map((r) => ({
      route: r.route, theme: r.theme, viewport: r.viewport, failures: r.failures,
      worst: r.worst,
    })),
  };
  fs.mkdirSync(path.join(SHOTS, SUFFIX), { recursive: true });
  fs.writeFileSync(path.join(SHOTS, SUFFIX, `audit-report-${SUFFIX}.json`), JSON.stringify(report, null, 2));

  console.log(stdout.join("\n"));
  log(`Rapport JSON : ${path.join(SHOTS, SUFFIX, `audit-report-${SUFFIX}.json`)}`);
  if (bad.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[audit-theme] ERREUR :", err);
  process.exitCode = 1;
});