import type { PublicConfig } from './types';

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Applique l'identité visuelle du client (couleurs, nom) sans recompiler le front. */
export function applyBranding(cfg: PublicConfig) {
  const root = document.documentElement;
  root.style.setProperty('--accent', cfg.branding.accent);
  root.style.setProperty('--accent-2', cfg.branding.accent2);
  root.style.setProperty('--accent-rgb', hexToRgb(cfg.branding.accent));
  root.style.setProperty('--accent-2-rgb', hexToRgb(cfg.branding.accent2));
  // Texte posé sur l'accent (boutons, jour sélectionné...) : blanc ou foncé selon la couleur du client, pour rester lisible.
  root.style.setProperty('--on-accent', readableOnAll([cfg.branding.accent, cfg.branding.accent2]));
  document.title = cfg.company.name;
}

/** Couleur stable dérivée d'un texte (calendriers : une couleur par personne). */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 58%)`;
}

/* ---------- Couleurs de calendrier : une couleur distincte et lisible par personne ---------- */
const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const toHex = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function parseColor(c: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [parseInt(hex[1]!.slice(0, 2), 16), parseInt(hex[1]!.slice(2, 4), 16), parseInt(hex[1]!.slice(4, 6), 16)];
  const hsl = /^hsl\(\s*([\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i.exec(c);
  if (hsl) return hslToRgb(+hsl[1]!, +hsl[2]! / 100, +hsl[3]! / 100);
  return [90, 90, 120];
}

/** Texte (blanc ou quasi noir) offrant le meilleur contraste sur TOUS les fonds donnés (extrémités d'un dégradé). */
export function readableOnAll(bgs: string[]): string {
  const worst = (fg: number) => Math.min(...bgs.map((b) => contrast(fg, luminance(parseColor(b)))));
  // Le blanc reste la référence tant qu'il est lisible (3:1, taille « grande » des boutons) ; sinon on passe au texte foncé.
  if (worst(1) >= 3) return '#ffffff';
  return worst(0.02) > worst(1) ? '#0b1020' : '#ffffff';
}

/** Texte (blanc ou quasi noir) le plus lisible sur un fond donné. */
export function readableOn(bg: string): string {
  const L = luminance(parseColor(bg));
  return contrast(1, L) >= contrast(0.02, L) ? '#ffffff' : '#0b1020';
}

function hueHash(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Fond assez sombre pour que du texte blanc atteigne un contraste d'au moins 4,5:1. */
function darkEnoughFor(h: number): string {
  for (let l = 0.5; l >= 0.26; l -= 0.02) {
    const rgb = hslToRgb(h, 0.62, l);
    if (contrast(1, luminance(rgb)) >= 4.6) return toHex(rgb);
  }
  return toHex(hslToRgb(h, 0.62, 0.26));
}

/**
 * Une couleur par personne, stable (même identifiant = même teinte) et distincte des autres personnes affichées :
 * deux teintes trop proches sont écartées. Chaque couleur garantit un texte blanc lisible.
 */
export function personColors(ids: string[]): Map<string, string> {
  const unique = [...new Set(ids)].sort();
  const gap = Math.max(10, Math.min(30, Math.floor(330 / Math.max(unique.length, 1))));
  const used: number[] = [];
  const out = new Map<string, string>();
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const id of unique) {
    let h = hueHash(id);
    for (let tries = 0; tries < 36 && used.some((u) => dist(u, h) < gap); tries++) h = (h + 11) % 360;
    used.push(h);
    out.set(id, darkEnoughFor(h));
  }
  return out;
}
