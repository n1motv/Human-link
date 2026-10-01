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
  document.title = cfg.company.name;
}

/** Couleur stable dérivée d'un texte (calendriers : une couleur par personne). */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 58%)`;
}
