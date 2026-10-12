/**
 * Worlds. A world's identity (its profile) is generated once from its seed
 * and the run's setting, then kept: name, biome, and the parts it is built
 * from. Each visit draws a fresh chain of 3-6 encounters for it.
 *
 * Parts all belong to the world's biome, so they fit together. Each part has
 * a danger value and the hazard is 1 plus their sum, so every hazard level
 * has causes the probe can report. A faction's danger follows its current
 * standing, so the hazard of a world it holds changes with your relations.
 *
 * Generation picks the hazard first (1-5, evenly) and then a combination of
 * parts that adds up to it, which keeps the difficulty curve tuned by the
 * playtest bots while making every level explainable.
 */

import { ARCHETYPES, BIOME_PARTS, DEVOTIONS, RUIN_STATES } from '../data/setting';
import { BIOMES, type BiomeId, type EncounterDef, type WorldBiome } from './encounter';
import { Rng, type Seed, deriveSeed } from './rng';
import { type Faction, type Setting, article, capitalize, factionDanger, factionName, fill, makeName, standingLabel } from './setting';

export const MIN_ENCOUNTERS = 3;
export const MAX_ENCOUNTERS = 6;
export const MIN_HAZARD = 1;
export const MAX_HAZARD = 5;

export interface WorldRuin {
  /** One of the builders' structures ("tide-clock"). */
  structure: string;
  place: string;
  state: string;
}

export interface WorldParts {
  landmark: string;
  condition: string;
  wildlife: string;
  ruin: WorldRuin | null;
  /** A faction living here, and where. */
  faction: { id: string; place: string } | null;
}

export interface WorldProfile {
  seed: number;
  name: string;
  biome: WorldBiome;
  /** Absent on the final world, which is not assembled from parts. */
  parts?: WorldParts;
}

/** A world as visited: its profile, its hazard at the time, and this visit's encounters. */
export interface World extends WorldProfile {
  /** 1 (benign) .. 5 (lethal), 6 for the final world. Raises check difficulty and chain length. */
  hazard: number;
  /** Encounter ids in the order they will be met. */
  encounters: string[];
}

/** Hazard of the final world: one step beyond the ordinary 1-5 scale. */
export const FINAL_HAZARD = 6;

export const HAZARD_LABEL = ['', 'Benign', 'Guarded', 'Hostile', 'Severe', 'Lethal', 'Beyond measure'] as const;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export interface ProfileOptions {
  biome?: BiomeId;
  hazard?: number;
  /** Names already used in this run; the new world gets a different one. */
  taken?: ReadonlySet<string>;
}

interface Option<T> {
  value: T;
  danger: number;
  weight: number;
}

export function generateWorldProfile(seed: Seed, setting: Setting, opts: ProfileOptions = {}): WorldProfile {
  const rng = new Rng(deriveSeed(seed, 'world'));
  const biome = opts.biome ?? rng.pick(BIOMES);
  const target = opts.hazard ?? rng.int(MIN_HAZARD, MAX_HAZARD);
  let name = makeName(rng, biome);
  for (let i = 0; i < 30 && opts.taken?.has(name); i++) name = makeName(rng, biome);

  const parts = BIOME_PARTS[biome];
  const conditions: Option<string>[] = parts.conditions.map((c) => ({ value: c.id, danger: c.danger, weight: 1 }));
  const wildlife: Option<string>[] = parts.wildlife.map((w) => ({ value: w.id, danger: w.danger, weight: 1 }));
  const ruins: Option<string | null>[] = [{ value: null, danger: 0, weight: 1 }, ...RUIN_STATES.map((s) => ({ value: s.id, danger: s.danger, weight: 0.4 }))];
  const here = setting.factions.filter((f) => f.biomes.includes(biome));
  const factions: Option<Faction | null>[] = [{ value: null, danger: 0, weight: 1 }, ...here.map((f) => ({ value: f, danger: factionDanger(f.standing), weight: 1 / here.length }))];

  // Every combination whose danger adds up to the target, weighted.
  const budget = target - 1;
  const combos: { c: Option<string>; w: Option<string>; r: Option<string | null>; f: Option<Faction | null>; weight: number }[] = [];
  for (const c of conditions)
    for (const w of wildlife)
      for (const r of ruins)
        for (const f of factions)
          if (c.danger + w.danger + r.danger + f.danger === budget) combos.push({ c, w, r, f, weight: c.weight * w.weight * r.weight * f.weight });
  if (combos.length === 0) throw new Error(`No ${biome} world adds up to hazard ${target}`);
  let roll = rng.next() * combos.reduce((a, x) => a + x.weight, 0);
  let pick = combos[combos.length - 1]!;
  for (const x of combos) {
    roll -= x.weight;
    if (roll < 0) {
      pick = x;
      break;
    }
  }

  const devotion = DEVOTIONS.find((d) => d.id === setting.builders.devotion)!;
  return {
    seed: deriveSeed(seed, 'id'),
    name,
    biome,
    parts: {
      landmark: rng.pick(parts.landmarks).id,
      condition: pick.c.value,
      wildlife: pick.w.value,
      ruin: pick.r.value === null ? null : { structure: rng.pick(devotion.structures), place: rng.pick(parts.ruinPlaces), state: pick.r.value },
      faction: pick.f.value === null ? null : { id: pick.f.value.id, place: rng.pick(parts.places) },
    },
  };
}

/** The final world's profile. */
export function finalWorldProfile(seed: Seed): WorldProfile {
  return { seed: deriveSeed(seed, 'final-world'), name: 'Farpoint', biome: 'final' };
}

function factionOf(profile: WorldProfile, setting: Setting): Faction | null {
  const id = profile.parts?.faction?.id;
  return id ? (setting.factions.find((f) => f.id === id) ?? null) : null;
}

export interface HazardCause {
  label: string;
  danger: number;
}

/** What makes this world dangerous right now, most dangerous first. */
export function hazardCauses(profile: WorldProfile, setting: Setting): HazardCause[] {
  const p = profile.parts;
  if (!p || profile.biome === 'final') return [];
  const bp = BIOME_PARTS[profile.biome];
  const causes: HazardCause[] = [];
  const cond = bp.conditions.find((c) => c.id === p.condition)!;
  causes.push({ label: cond.label, danger: cond.danger });
  const wild = bp.wildlife.find((w) => w.id === p.wildlife)!;
  causes.push({ label: wild.label, danger: wild.danger });
  if (p.ruin) {
    const st = RUIN_STATES.find((s) => s.id === p.ruin!.state)!;
    causes.push({ label: st.label, danger: st.danger });
  }
  const f = factionOf(profile, setting);
  if (f) causes.push({ label: `${factionName(f)} (${standingLabel(f.standing).toLowerCase()})`, danger: factionDanger(f.standing) });
  return causes.filter((c) => c.danger > 0).sort((a, b) => b.danger - a.danger);
}

/** The world's hazard now: 1 plus the danger of its parts (the final world is fixed). */
export function worldHazard(profile: WorldProfile, setting: Setting): number {
  if (profile.biome === 'final') return FINAL_HAZARD;
  const sum = hazardCauses(profile, setting).reduce((a, c) => a + c.danger, 0);
  return Math.max(MIN_HAZARD, Math.min(MAX_HAZARD, 1 + sum));
}

/** "Aumari tide-clock". */
export function ruinName(ruin: WorldRuin, setting: Setting): string {
  return `${setting.builders.name} ${ruin.structure}`;
}

/** The world as the team sees it on arrival: a few sentences built from its parts. */
export function describeWorld(profile: WorldProfile, setting: Setting): string[] {
  const p = profile.parts;
  if (!p || profile.biome === 'final') return [`The world every address in the network was built to reach. The ${setting.builders.name} called it the Farpoint.`];
  const bp = BIOME_PARTS[profile.biome];
  const lines = [bp.landmarks.find((l) => l.id === p.landmark)!.text, bp.conditions.find((c) => c.id === p.condition)!.text];
  if (p.ruin) {
    const st = RUIN_STATES.find((s) => s.id === p.ruin!.state)!;
    const name = ruinName(p.ruin, setting);
    lines.push(`${capitalize(p.ruin.place)}, ${article(name)} ${name} ${st.text}.`);
  }
  const f = factionOf(profile, setting);
  if (f && p.faction) {
    const arch = ARCHETYPES.find((a) => a.id === f.archetype)!;
    const template = p.ruin ? arch.presence.ruins : arch.presence.open;
    lines.push(fill(template, { faction: factionName(f), place: p.faction.place, ruin: p.ruin ? ruinName(p.ruin, setting) : '', builders: setting.builders.name }));
  }
  const wild = bp.wildlife.find((w) => w.id === p.wildlife)!;
  // Harmless animals only get a line on an otherwise empty world.
  if (wild.danger > 0 || (!p.ruin && !f)) lines.push(wild.text);
  return lines;
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

/** Encounters that can appear in a biome. */
export function poolFor(biome: WorldBiome, defs: readonly EncounterDef[]): EncounterDef[] {
  return defs.filter((d) => d.biome === biome || (d.biome === 'any' && biome !== 'final'));
}

/** Weighted draw of `count` distinct encounters. */
function drawEncounters(rng: Rng, pool: readonly EncounterDef[], count: number): string[] {
  const remaining = pool.slice();
  const out: string[] = [];
  while (out.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, d) => sum + (d.weight ?? 1), 0);
    let roll = rng.next() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      roll -= remaining[idx]!.weight ?? 1;
      if (roll < 0) break;
    }
    out.push(remaining[idx]!.id);
    remaining.splice(idx, 1);
  }
  return out;
}

/** Chain length grows with hazard: roughly 3 at hazard 1, 6 at hazard 5. */
export function chainLength(hazard: number, rng: Rng): number {
  return Math.max(MIN_ENCOUNTERS, Math.min(MAX_ENCOUNTERS, 2 + Math.round(hazard * 0.75) + rng.int(0, 1)));
}

/** Open the ring on a world: its current hazard and a chain of encounters drawn with `visitSeed`. */
export function openWorld(profile: WorldProfile, setting: Setting, visitSeed: Seed, defs: readonly EncounterDef[]): World {
  const hazard = worldHazard(profile, setting);
  if (profile.biome === 'final') {
    const encounters = defs.filter((d) => d.biome === 'final').map((d) => d.id);
    if (encounters.length < MIN_ENCOUNTERS) throw new Error('Not enough final encounters');
    return { ...profile, hazard, encounters };
  }
  const rng = new Rng(deriveSeed(visitSeed, 'encounters'));
  const length = chainLength(hazard, rng);
  const pool = poolFor(profile.biome, defs);
  if (pool.length < length) throw new Error(`Biome ${profile.biome} has only ${pool.length} encounters; need ${length}`);
  return { ...profile, hazard, encounters: drawEncounters(rng, pool, length) };
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export interface ProbeReport {
  hazard: number;
  /** What makes it dangerous (empty on a benign world). */
  causes: string[];
  hint: string;
}

/** What a probe reveals: the hazard, its causes, and a hint about one encounter. */
export function probeWorld(world: World, setting: Setting, defs: readonly EncounterDef[]): ProbeReport {
  const rng = new Rng(deriveSeed(world.seed, 'probe'));
  const id = rng.pick(world.encounters);
  const def = defs.find((d) => d.id === id);
  return { hazard: world.hazard, causes: hazardCauses(world, setting).map((c) => c.label), hint: def?.probeHint ?? 'Telemetry is inconclusive.' };
}
