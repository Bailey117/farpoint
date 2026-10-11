/**
 * Team members: role, three stats, and a 3-step wound track with permadeath.
 *
 * Wounds: 0 healthy, 1 wounded (-1 to all stats), 2 critical (-2), 3 dead.
 */

import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import type { Rng } from './rng';

export const ROLES = ['soldier', 'scientist', 'linguist', 'medic'] as const;
export type Role = (typeof ROLES)[number];

export const STATS = ['grit', 'insight', 'rapport'] as const;
export type Stat = (typeof STATS)[number];

export const STAT_LABEL: Record<Stat, string> = { grit: 'Grit', insight: 'Insight', rapport: 'Rapport' };
export const ROLE_LABEL: Record<Role, string> = {
  soldier: 'Soldier',
  scientist: 'Scientist',
  linguist: 'Linguist',
  medic: 'Medic',
};

export const MAX_WOUNDS = 3;
export type WoundLevel = 0 | 1 | 2 | 3;
export const WOUND_LABEL: Record<WoundLevel, string> = { 0: 'Healthy', 1: 'Wounded', 2: 'Critical', 3: 'Dead' };

export interface Member {
  id: string;
  name: string;
  role: Role;
  /** Base stats, 1..5. */
  stats: Record<Stat, number>;
  wounds: WoundLevel;
}

/** Base stat template per role, before a small random variation. */
const ROLE_STATS: Record<Role, Record<Stat, number>> = {
  soldier: { grit: 4, insight: 1, rapport: 2 },
  scientist: { grit: 1, insight: 4, rapport: 2 },
  linguist: { grit: 2, insight: 2, rapport: 4 },
  medic: { grit: 2, insight: 3, rapport: 3 },
};

export function generateMember(rng: Rng, role: Role, id: string): Member {
  const stats = { ...ROLE_STATS[role] };
  // One stat gets +1, keeping members of the same role distinct.
  const boosted = rng.pick(STATS);
  stats[boosted] = Math.min(5, stats[boosted] + 1);
  return { id, name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, role, stats, wounds: 0 };
}

/** A starting team: one of each role. */
export function generateTeam(rng: Rng): Member[] {
  return ROLES.map((role, i) => generateMember(rng, role, `m${i + 1}`));
}

export function isAlive(m: Member): boolean {
  return m.wounds < MAX_WOUNDS;
}

/** Stat after wound penalties; 0 for the dead. */
export function effectiveStat(m: Member, stat: Stat): number {
  if (!isAlive(m)) return 0;
  return Math.max(0, m.stats[stat] - m.wounds);
}

/** Returns a new member with wounds changed by `delta`, clamped to 0..3. */
export function changeWounds(m: Member, delta: number): Member {
  if (!isAlive(m)) return m; // the dead stay dead
  const wounds = Math.max(0, Math.min(MAX_WOUNDS, m.wounds + delta)) as WoundLevel;
  return { ...m, wounds };
}

export function livingMembers(team: readonly Member[]): Member[] {
  return team.filter(isAlive);
}
