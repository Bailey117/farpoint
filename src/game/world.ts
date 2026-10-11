/**
 * Worlds: generated from a seed. A world has a biome, a hazard level and a
 * fixed chain of 3-6 encounters drawn from the content pool.
 */

import { WORLD_SYLLABLES } from '../data/biomes';
import { BIOMES, type BiomeId, type EncounterDef, type WorldBiome } from './encounter';
import { Rng, type Seed, deriveSeed } from './rng';

export const MIN_ENCOUNTERS = 3;
export const MAX_ENCOUNTERS = 6;

export interface World {
  seed: number;
  name: string;
  biome: WorldBiome;
  /** 1 (benign) .. 5 (lethal). Raises check difficulty and chain length. */
  hazard: number;
  /** Encounter ids in the order they will be met. */
  encounters: string[];
}

export function worldName(rng: Rng): string {
  const parts: string[] = [rng.pick(WORLD_SYLLABLES.start)];
  if (rng.chance(0.6)) parts.push(rng.pick(WORLD_SYLLABLES.middle));
  parts.push(rng.pick(WORLD_SYLLABLES.end));
  return parts.join('');
}

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

export interface WorldOptions {
  biome?: BiomeId;
  hazard?: number;
}

export function generateWorld(seed: Seed, defs: readonly EncounterDef[], opts: WorldOptions = {}): World {
  const rng = new Rng(deriveSeed(seed, 'world'));
  const name = worldName(rng);
  const biome = opts.biome ?? rng.pick(BIOMES);
  const hazard = opts.hazard ?? rng.int(1, 5);
  // Chain length grows with hazard: roughly 3 at hazard 1, 6 at hazard 5.
  const length = Math.max(MIN_ENCOUNTERS, Math.min(MAX_ENCOUNTERS, 2 + Math.round(hazard * 0.75) + rng.int(0, 1)));
  const pool = poolFor(biome, defs);
  if (pool.length < length) throw new Error(`Biome ${biome} has only ${pool.length} encounters; need ${length}`);
  const encounters = drawEncounters(new Rng(deriveSeed(seed, 'encounters')), pool, length);
  return { seed: typeof seed === 'number' ? seed >>> 0 : deriveSeed(seed, 'id'), name, biome, hazard, encounters };
}

/** The final world: hazard 5, its whole chain drawn from the 'final' pool in order. */
export function generateFinalWorld(seed: Seed, defs: readonly EncounterDef[]): World {
  const encounters = defs.filter((d) => d.biome === 'final').map((d) => d.id);
  if (encounters.length < MIN_ENCOUNTERS) throw new Error('Not enough final encounters');
  return { seed: deriveSeed(seed, 'final-world'), name: 'Farpoint', biome: 'final', hazard: 5, encounters };
}

export interface ProbeReport {
  hazard: number;
  hint: string;
}

/** What a probe reveals: the hazard level and a hint about one encounter. */
export function probeWorld(world: World, defs: readonly EncounterDef[]): ProbeReport {
  const rng = new Rng(deriveSeed(world.seed, 'probe'));
  const id = rng.pick(world.encounters);
  const def = defs.find((d) => d.id === id);
  return { hazard: world.hazard, hint: def?.probeHint ?? 'Telemetry is inconclusive.' };
}

export const HAZARD_LABEL = ['', 'Benign', 'Guarded', 'Hostile', 'Severe', 'Lethal'] as const;
