/**
 * Encounter definitions: the shape content is written in (see src/data),
 * plus a validator so malformed content fails tests, not play.
 *
 * Text may use {actor} (the member who acted) and {target} (the member an
 * effect landed on); the engine fills these in.
 */

import type { AidKind } from './decode';
import { ROLES, type Role, STATS, type Stat } from './team';

export const BIOMES = ['glass', 'tidal', 'spore', 'rime'] as const;
export type BiomeId = (typeof BIOMES)[number];
/** The final world has its own encounter pool. */
export type WorldBiome = BiomeId | 'final';

/** A number or an inclusive [min, max] range rolled with the seeded RNG. */
export type Amount = number | readonly [number, number];

export type Effect =
  /** Salvage: the currency spent at base. */
  | { kind: 'salvage'; amount: Amount }
  /** A puzzle-aid item. */
  | { kind: 'item'; item: AidKind; amount?: number }
  /** Gain (positive) or lose (negative) power. */
  | { kind: 'power'; amount: Amount }
  /**
   * Wounds. `amount` steps (3 kills outright). Target: the acting member, a
   * random living member, or everyone. `chance` makes it a gamble.
   */
  | { kind: 'wound'; target: 'actor' | 'random' | 'all'; amount: 1 | 2 | 3; chance?: number }
  | { kind: 'heal'; target: 'actor' | 'random' | 'all'; amount: 1 | 2 }
  /** An address fragment: minor = a partial clue, major = a known slot. */
  | { kind: 'fragment'; strength: 'minor' | 'major' };

export interface Outcome {
  text: string;
  effects: readonly Effect[];
}

export interface Check {
  stat: Stat;
  /** 1 (easy) .. 5 (very hard). */
  difficulty: number;
  /** This role gets a bonus when attempting it. */
  favoredRole?: Role;
}

export interface Choice {
  id: string;
  label: string;
  /** Spent up front; the choice is unavailable without it. */
  powerCost?: number;
  /** No check: the success outcome always applies. */
  check?: Check;
  success: Outcome;
  /** Required when there is a check. */
  failure?: Outcome;
}

export interface EncounterDef {
  id: string;
  /** 'any' encounters can appear in every ordinary biome; 'final' only on the final world. */
  biome: WorldBiome | 'any';
  title: string;
  text: string;
  /** What a probe of the world might reveal when this encounter lies ahead. */
  probeHint: string;
  /** Relative likelihood of being drawn (default 1). */
  weight?: number;
  choices: readonly Choice[];
}

const AID_KINDS = ['reveal', 'eliminate', 'freeDial'];

function amountOk(a: Amount): boolean {
  if (typeof a === 'number') return Number.isFinite(a);
  return a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]) && a[0] <= a[1];
}

/** Returns a list of problems (empty when the content is valid). */
export function validateEncounters(defs: readonly EncounterDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const e of defs) {
    const where = `encounter "${e.id}"`;
    if (ids.has(e.id)) problems.push(`${where}: duplicate id`);
    ids.add(e.id);
    if (e.biome !== 'any' && e.biome !== 'final' && !(BIOMES as readonly string[]).includes(e.biome)) problems.push(`${where}: unknown biome ${e.biome}`);
    if (!e.title.trim() || !e.text.trim() || !e.probeHint.trim()) problems.push(`${where}: missing title, text or probeHint`);
    if (e.choices.length < 2 || e.choices.length > 3) problems.push(`${where}: needs 2-3 choices, has ${e.choices.length}`);
    const choiceIds = new Set<string>();
    for (const c of e.choices) {
      const cw = `${where} choice "${c.id}"`;
      if (choiceIds.has(c.id)) problems.push(`${cw}: duplicate choice id`);
      choiceIds.add(c.id);
      if (!c.label.trim()) problems.push(`${cw}: missing label`);
      if (c.powerCost !== undefined && (c.powerCost < 0 || !Number.isInteger(c.powerCost))) problems.push(`${cw}: bad powerCost`);
      if (c.check) {
        if (!(STATS as readonly string[]).includes(c.check.stat)) problems.push(`${cw}: unknown stat`);
        if (c.check.difficulty < 1 || c.check.difficulty > 5) problems.push(`${cw}: difficulty out of 1-5`);
        if (c.check.favoredRole && !(ROLES as readonly string[]).includes(c.check.favoredRole)) problems.push(`${cw}: unknown role`);
        if (!c.failure) problems.push(`${cw}: a check needs a failure outcome`);
      }
      for (const [label, outcome] of [['success', c.success], ['failure', c.failure]] as const) {
        if (!outcome) continue;
        if (!outcome.text.trim()) problems.push(`${cw} ${label}: missing text`);
        // {target} must name someone who is certainly affected.
        if (outcome.text.includes('{target}')) {
          const named = outcome.effects.some((fx) => (fx.kind === 'wound' || fx.kind === 'heal') && fx.target === 'random' && !('chance' in fx && fx.chance !== undefined));
          if (!named) problems.push(`${cw} ${label}: {target} needs a guaranteed 'random' wound or heal`);
        }
        if (outcome.text.includes('{actor}') && !c.check) problems.push(`${cw} ${label}: {actor} needs a check`);
        for (const fx of outcome.effects) {
          if ((fx.kind === 'salvage' || fx.kind === 'power') && !amountOk(fx.amount)) problems.push(`${cw} ${label}: bad amount`);
          if (fx.kind === 'item' && !AID_KINDS.includes(fx.item)) problems.push(`${cw} ${label}: unknown item ${fx.item}`);
          if (fx.kind === 'wound' && fx.chance !== undefined && (fx.chance <= 0 || fx.chance > 1)) problems.push(`${cw} ${label}: bad chance`);
          if ((fx.kind === 'wound' || fx.kind === 'heal') && fx.target === 'actor' && !c.check) {
            problems.push(`${cw} ${label}: 'actor' target needs a check (someone must act)`);
          }
        }
      }
    }
  }
  return problems;
}
