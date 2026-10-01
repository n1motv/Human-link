import type { Types } from 'mongoose';
import { Supervision } from '../models/Supervision.js';
import { User, type UserDoc } from '../models/User.js';
import { forbidden, notFound } from '../utils/errors.js';

export interface Actor {
  userId: string;
  role: 'admin' | 'manager' | 'employe';
}

/** Identifiants des personnes directement supervisées par ce manager. */
export async function managedIds(managerId: string | Types.ObjectId): Promise<string[]> {
  const rows = await Supervision.find({ managerId }, { superviseId: 1 });
  return rows.map((r) => String(r.superviseId));
}

export async function managerOf(userId: string | Types.ObjectId): Promise<string | null> {
  const row = await Supervision.findOne({ superviseId: userId }, { managerId: 1 });
  return row ? String(row.managerId) : null;
}

/** Règle d'accès unique aux données d'une personne : soi-même, un admin, ou son manager direct. */
export async function canAccessUser(actor: Actor, targetId: string): Promise<boolean> {
  if (actor.role === 'admin' || actor.userId === targetId) return true;
  if (actor.role === 'manager') return (await managedIds(actor.userId)).includes(targetId);
  return false;
}

export async function assertCanAccessUser(actor: Actor, targetId: string): Promise<void> {
  if (!(await canAccessUser(actor, targetId))) throw forbidden();
}

export async function loadUser(id: string): Promise<UserDoc> {
  const user = await User.findById(id);
  if (!user) throw notFound('Utilisateur introuvable');
  return user;
}

/** Nom affichable sans données sensibles. */
export function displayName(u: { prenom?: string | null; nom?: string | null }): string {
  return `${u.prenom ?? ''} ${u.nom ?? ''}`.trim();
}
