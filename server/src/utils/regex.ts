/** Échappe une saisie utilisateur avant de l'utiliser dans une RegExp (évite ReDoS et injections). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
