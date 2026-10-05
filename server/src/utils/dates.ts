import { z } from 'zod';

/** Les dates métier sont des chaînes AAAA-MM-JJ : pas de fuseau horaire, comparables lexicographiquement. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine((s) => !Number.isNaN(toUtc(s).getTime()) && fmt(toUtc(s)) === s, 'Date invalide');

export function toUtc(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return fmt(new Date());
}

export function addDays(s: string, n: number): string {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function monthOf(s: string): string {
  return s.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(today());
}

/** Liste des jours de [start, end] inclus. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Nombre de jours ouvrés (selon la config du client) entre deux dates incluses. */
export function countWorkingDays(start: string, end: string, workingDays: number[]): number {
  return eachDay(start, end).filter((d) => workingDays.includes(toUtc(d).getUTCDay())).length;
}

/** Lundi de la semaine suivante (jour courant exclu). */
export function nextMonday(from = today()): string {
  const dow = toUtc(from).getUTCDay(); // 0 = dimanche
  const delta = (8 - dow) % 7 || 7;
  return addDays(from, delta);
}

export function ageOn(birth: string, ref = today()): number {
  const b = toUtc(birth);
  const r = toUtc(ref);
  let age = r.getUTCFullYear() - b.getUTCFullYear();
  if (r.getUTCMonth() < b.getUTCMonth() || (r.getUTCMonth() === b.getUTCMonth() && r.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** Deux intervalles [aS,aE] et [bS,bE] (inclusifs) se chevauchent-ils ? */
export function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS <= bE && bS <= aE;
}
