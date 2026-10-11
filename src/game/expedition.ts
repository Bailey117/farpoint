/**
 * Expedition engine: walk a world's chain of encounters with a team.
 *
 * Immutable state, pure functions, all randomness from the seeded RNG
 * stored in the state, so an expedition replays exactly from its seed and
 * the player's choices.
 *
 * Flow: for each encounter the player picks a choice and (for checks) the
 * member who attempts it. After the last encounter the team dials home,
 * which costs power. An emergency dial-out can end it early at a higher
 * cost. Not being able to pay for the trip home strands the team.
 */

import type { AidKind } from './decode';
import type { Amount, Check, Choice, Effect, EncounterDef, Outcome } from './encounter';
import { Rng, deriveSeed } from './rng';
import { type Member, changeWounds, effectiveStat, isAlive, livingMembers } from './team';
import type { World } from './world';

export interface ExpeditionConfig {
  /** Power to dial home after the last encounter. */
  returnCost: number;
  /** Power to dial out early, mid-expedition. */
  emergencyCost: number;
  /** Bonus chance when the actor has the check's favoured role. */
  roleBonus: number;
}

export const DEFAULT_EXPEDITION_CONFIG: ExpeditionConfig = {
  /** Dialling home after the last encounter is free, as rings are meant to work. */
  returnCost: 0,
  emergencyCost: 15,
  roleBonus: 0.15,
};

export type ExpeditionStatus =
  /** Facing encounter `step`. */
  | 'encounter'
  /** All encounters done; waiting to dial home. */
  | 'complete'
  /** Ended: home safely after the full chain. */
  | 'returned'
  /** Ended: emergency dial-out. */
  | 'evacuated'
  /** Ended: could not afford the trip home. The team is lost. */
  | 'stranded'
  /** Ended: every member is dead. */
  | 'wiped';

export const ENDED: ReadonlySet<ExpeditionStatus> = new Set(['returned', 'evacuated', 'stranded', 'wiped']);

export interface Haul {
  salvage: number;
  items: Record<AidKind, number>;
  fragments: ('minor' | 'major')[];
}

export type AppliedEffect =
  | { kind: 'salvage'; amount: number }
  | { kind: 'item'; item: AidKind; amount: number }
  | { kind: 'power'; amount: number }
  | { kind: 'wound'; memberId: string; from: number; to: number; died: boolean }
  | { kind: 'heal'; memberId: string; from: number; to: number }
  | { kind: 'fragment'; strength: 'minor' | 'major' }
  /** A gamble (wound with `chance`) that did not land. */
  | { kind: 'spared'; memberId: string };

export interface Resolution {
  encounterId: string;
  choiceId: string;
  actorId: string | null;
  /** Null when the choice had no check. */
  chance: number | null;
  success: boolean;
  text: string;
  applied: AppliedEffect[];
}

export interface ExpeditionState {
  world: World;
  team: Member[];
  power: number;
  step: number;
  status: ExpeditionStatus;
  haul: Haul;
  log: Resolution[];
  /** Whether the medic has treated someone during the current step. */
  medicUsed: boolean;
  config: ExpeditionConfig;
  rngState: number;
}

export function startExpedition(
  world: World,
  team: readonly Member[],
  power: number,
  config: ExpeditionConfig = DEFAULT_EXPEDITION_CONFIG,
): ExpeditionState {
  const state: ExpeditionState = {
    world,
    team: team.map((m) => ({ ...m, stats: { ...m.stats } })),
    power,
    step: 0,
    status: world.encounters.length > 0 ? 'encounter' : 'complete',
    haul: { salvage: 0, items: { reveal: 0, eliminate: 0, freeDial: 0 }, fragments: [] },
    log: [],
    medicUsed: false,
    config,
    rngState: new Rng(deriveSeed(world.seed, 'expedition')).getState(),
  };
  return livingMembers(state.team).length === 0 ? { ...state, status: 'wiped' } : state;
}

export function currentEncounter(state: ExpeditionState, defs: readonly EncounterDef[]): EncounterDef | null {
  if (state.status !== 'encounter') return null;
  const id = state.world.encounters[state.step];
  return defs.find((d) => d.id === id) ?? null;
}

/**
 * Chance (0.05..0.95) that `member` succeeds at a check:
 * 50% at stat == difficulty, 15% per point either way, hazard nudging
 * difficulty by half a point per level above/below 3, plus the role bonus.
 */
export function successChance(
  member: Member,
  check: Check,
  hazard: number,
  config: ExpeditionConfig = DEFAULT_EXPEDITION_CONFIG,
): number {
  if (!isAlive(member)) return 0;
  const difficulty = check.difficulty + (hazard - 3) * 0.5;
  let p = 0.5 + 0.15 * (effectiveStat(member, check.stat) - difficulty);
  if (check.favoredRole && member.role === check.favoredRole) p += config.roleBonus;
  return Math.round(Math.min(0.95, Math.max(0.05, p)) * 100) / 100;
}

export type ChoiceBlock = 'power' | null;

/** Why a choice can't be taken right now (null when it can). */
export function choiceBlocked(state: ExpeditionState, choice: Choice): ChoiceBlock {
  return (choice.powerCost ?? 0) > state.power ? 'power' : null;
}

export type ExpeditionError =
  | { kind: 'not-in-encounter'; status: ExpeditionStatus }
  | { kind: 'unknown-choice'; choiceId: string }
  | { kind: 'no-power'; needed: number; have: number }
  | { kind: 'actor-required' }
  | { kind: 'invalid-actor'; actorId: string }
  | { kind: 'not-complete' }
  | { kind: 'ended'; status: ExpeditionStatus }
  | { kind: 'no-medic' }
  | { kind: 'medic-used' }
  | { kind: 'nothing-to-treat' };

export type Result<T> = { ok: true; state: ExpeditionState; value: T } | { ok: false; error: ExpeditionError };

function rollAmount(rng: Rng, a: Amount): number {
  return typeof a === 'number' ? a : rng.int(a[0], a[1]);
}

function fill(text: string, names: { actor?: string; target?: string }): string {
  return text.replace(/\{actor\}/g, names.actor ?? 'The team').replace(/\{target\}/g, names.target ?? 'Someone');
}

/** Apply one outcome's effects. Exported for tests. */
export function applyOutcome(
  state: ExpeditionState,
  outcome: Outcome,
  actorId: string | null,
  rng: Rng,
): { state: ExpeditionState; applied: AppliedEffect[]; targetName?: string } {
  const team = state.team.slice();
  let power = state.power;
  const haul: Haul = { salvage: state.haul.salvage, items: { ...state.haul.items }, fragments: state.haul.fragments.slice() };
  const applied: AppliedEffect[] = [];
  let targetName: string | undefined;

  const targetsFor = (target: 'actor' | 'random' | 'all'): number[] => {
    const living = team.map((m, i) => (isAlive(m) ? i : -1)).filter((i) => i >= 0);
    if (target === 'all') return living;
    if (target === 'actor') {
      const i = team.findIndex((m) => m.id === actorId);
      return i >= 0 && isAlive(team[i]!) ? [i] : [];
    }
    return living.length ? [rng.pick(living)] : [];
  };

  for (const fx of outcome.effects as readonly Effect[]) {
    switch (fx.kind) {
      case 'salvage': {
        const n = rollAmount(rng, fx.amount);
        haul.salvage += n;
        applied.push({ kind: 'salvage', amount: n });
        break;
      }
      case 'item': {
        const n = fx.amount ?? 1;
        haul.items[fx.item] += n;
        applied.push({ kind: 'item', item: fx.item, amount: n });
        break;
      }
      case 'power': {
        const n = rollAmount(rng, fx.amount);
        const before = power;
        power = Math.max(0, power + n);
        applied.push({ kind: 'power', amount: power - before });
        break;
      }
      case 'wound': {
        for (const i of targetsFor(fx.target)) {
          const m = team[i]!;
          if (fx.target !== 'all') targetName = m.name;
          if (fx.chance !== undefined && !rng.chance(fx.chance)) {
            applied.push({ kind: 'spared', memberId: m.id });
            continue;
          }
          const next = changeWounds(m, fx.amount);
          team[i] = next;
          applied.push({ kind: 'wound', memberId: m.id, from: m.wounds, to: next.wounds, died: !isAlive(next) });
        }
        break;
      }
      case 'heal': {
        for (const i of targetsFor(fx.target)) {
          const m = team[i]!;
          if (fx.target !== 'all') targetName = m.name;
          const next = changeWounds(m, -fx.amount);
          team[i] = next;
          if (next.wounds !== m.wounds) applied.push({ kind: 'heal', memberId: m.id, from: m.wounds, to: next.wounds });
        }
        break;
      }
      case 'fragment': {
        haul.fragments.push(fx.strength);
        applied.push({ kind: 'fragment', strength: fx.strength });
        break;
      }
    }
  }
  return { state: { ...state, team, power, haul }, applied, targetName };
}

/**
 * Take a choice in the current encounter. `actorId` is required for choices
 * with a check (the member who attempts it) and ignored otherwise.
 */
export function choose(
  state: ExpeditionState,
  defs: readonly EncounterDef[],
  choiceId: string,
  actorId: string | null,
): Result<Resolution> {
  if (state.status !== 'encounter') return { ok: false, error: { kind: 'not-in-encounter', status: state.status } };
  const enc = currentEncounter(state, defs);
  const choice = enc?.choices.find((c) => c.id === choiceId);
  if (!enc || !choice) return { ok: false, error: { kind: 'unknown-choice', choiceId } };
  const cost = choice.powerCost ?? 0;
  if (cost > state.power) return { ok: false, error: { kind: 'no-power', needed: cost, have: state.power } };

  let actor: Member | null = null;
  if (choice.check) {
    if (!actorId) return { ok: false, error: { kind: 'actor-required' } };
    actor = state.team.find((m) => m.id === actorId) ?? null;
    if (!actor || !isAlive(actor)) return { ok: false, error: { kind: 'invalid-actor', actorId } };
  }

  const rng = Rng.fromState(state.rngState);
  let chance: number | null = null;
  let success = true;
  if (choice.check && actor) {
    chance = successChance(actor, choice.check, state.world.hazard, state.config);
    success = rng.next() < chance;
  }
  const outcome = success ? choice.success : (choice.failure as Outcome);
  const paid: ExpeditionState = { ...state, power: state.power - cost };
  const { state: after, applied, targetName } = applyOutcome(paid, outcome, actor?.id ?? null, rng);
  const resolution: Resolution = {
    encounterId: enc.id,
    choiceId,
    actorId: actor?.id ?? null,
    chance,
    success,
    text: fill(outcome.text, { actor: actor?.name, target: targetName }),
    applied: cost > 0 ? [{ kind: 'power', amount: -cost }, ...applied] : applied,
  };

  const step = state.step + 1;
  let status: ExpeditionStatus = step >= state.world.encounters.length ? 'complete' : 'encounter';
  if (livingMembers(after.team).length === 0) status = 'wiped';
  return {
    ok: true,
    state: { ...after, step, status, log: [...state.log, resolution], medicUsed: false, rngState: rng.getState() },
    value: resolution,
  };
}

/** Dial home after the last encounter. Too little power strands the team. */
export function returnHome(state: ExpeditionState): Result<{ cost: number; stranded: boolean }> {
  if (state.status !== 'complete') return { ok: false, error: state.status === 'encounter' ? { kind: 'not-complete' } : { kind: 'ended', status: state.status } };
  const cost = state.config.returnCost;
  if (state.power < cost) {
    return { ok: true, state: { ...state, status: 'stranded' }, value: { cost, stranded: true } };
  }
  return { ok: true, state: { ...state, power: state.power - cost, status: 'returned' }, value: { cost, stranded: false } };
}

/** Abort mid-expedition. Only possible if the emergency cost can be paid. */
export function emergencyDialOut(state: ExpeditionState): Result<{ cost: number }> {
  if (ENDED.has(state.status)) return { ok: false, error: { kind: 'ended', status: state.status } };
  const cost = state.config.emergencyCost;
  if (state.power < cost) return { ok: false, error: { kind: 'no-power', needed: cost, have: state.power } };
  return { ok: true, state: { ...state, power: state.power - cost, status: 'evacuated' }, value: { cost } };
}

/** The medic patches one wound step on a living member, once per step. */
export function medicTreat(state: ExpeditionState, targetId: string): Result<{ memberId: string; to: number }> {
  if (ENDED.has(state.status)) return { ok: false, error: { kind: 'ended', status: state.status } };
  if (state.medicUsed) return { ok: false, error: { kind: 'medic-used' } };
  const medic = state.team.find((m) => m.role === 'medic' && isAlive(m) && m.wounds < 2);
  if (!medic) return { ok: false, error: { kind: 'no-medic' } };
  const i = state.team.findIndex((m) => m.id === targetId);
  const target = state.team[i];
  if (!target || !isAlive(target) || target.wounds === 0) return { ok: false, error: { kind: 'nothing-to-treat' } };
  const team = state.team.slice();
  team[i] = changeWounds(target, -1);
  return { ok: true, state: { ...state, team, medicUsed: true }, value: { memberId: targetId, to: team[i]!.wounds } };
}

/** Is the trip home still affordable at the current power? */
export function canAffordReturn(state: ExpeditionState): boolean {
  return state.power >= state.config.returnCost;
}
