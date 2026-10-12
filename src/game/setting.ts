/**
 * The run's setting: who built the ring network, how they ended, and the
 * factions living in it now. Generated once per run and saved with it, so
 * every world, encounter and journal line can refer back to the same story.
 *
 * Factions carry a standing towards the player (-3 at war .. 3 allied). Their
 * presence on a world adds to its hazard according to that standing, so
 * better relations make their worlds safer.
 */

import {
  ARCHETYPES,
  DEVOTIONS,
  FALLS,
  type FactionTier,
  NAME_STYLES,
  type NameStyle,
  type NameStyleId,
  RUN_FACTIONS,
  STANDING_LABEL,
} from '../data/setting';
import { NAME_BLOCKLIST } from '../data/nameBlocklist';
import { BIOMES, type BiomeId } from './encounter';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const VOWEL = /[aeiouy]/;

/** A pronounceable name in the given style: syllables (onset + vowel) then a coda. */
export function makeName(rng: Rng, styleId: NameStyleId): string {
  const style: NameStyle = NAME_STYLES[styleId];
  for (let attempt = 0; attempt < 50; attempt++) {
    const count = weighted(rng, style.syllables) + 1;
    let name = '';
    let prev = '';
    for (let i = 0; i < count; i++) {
      const onset = i === 0 ? rng.pick(style.first) : rng.pick(style.onsets);
      // A vowel-only first "onset" (like 'a') stands in for the whole first syllable.
      const syl = i === 0 && onset.length > 0 && VOWEL.test(onset[0]!) ? onset : onset + rng.pick(style.vowels);
      if (syl === prev) continue;
      name += syl;
      prev = syl;
    }
    name += rng.pick(style.codas);
    if (isPleasant(name)) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  // Every style can produce a pleasant name; this is only a guard.
  return styleId.charAt(0).toUpperCase() + styleId.slice(1);
}

/** Rejects names that are too short, too long, or hard to say. */
export function isPleasant(name: string): boolean {
  const n = name.toLowerCase();
  if (n.length < 5 || n.length > 10) return false;
  if (/[^aeiouy]{4}/.test(n)) return false; // four consonants in a row
  if (/[aeiou]{3}/.test(n)) return false; // three vowels in a row
  if (/aa|ii|uu|yy/.test(n)) return false; // doubled vowels other than ee and oo
  if (/(.)\1\1/.test(n)) return false; // a letter three times
  if (/(..).?\1/.test(n)) return false; // a stutter, like "kakar" or "lolo"
  if (NAME_BLOCKLIST.has(n)) return false; // a real word or name
  return VOWEL.test(n);
}

function weighted(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** "a" or "an" for the word that follows. */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Setting
// ---------------------------------------------------------------------------

export interface Builders {
  /** Used both as noun ("the Aumari") and adjective ("an Aumari archive"). */
  name: string;
  devotion: string;
  fall: string;
}

export interface Faction {
  id: string;
  archetype: string;
  tier: FactionTier;
  /** Without the article: "Rustwake Company". */
  name: string;
  /** Whether "the" goes before the name. */
  article: boolean;
  /** Biomes where this faction can be found. */
  biomes: BiomeId[];
  /** -3 at war .. 3 allied. */
  standing: number;
}

export interface Setting {
  builders: Builders;
  factions: Faction[];
}

export const MIN_STANDING = -3;
export const MAX_STANDING = 3;

export function generateSetting(rng: Rng): Setting {
  const builders: Builders = {
    name: makeName(rng, 'builders'),
    devotion: rng.pick(DEVOTIONS).id,
    fall: rng.pick(FALLS).id,
  };
  const minors = rng.shuffle(ARCHETYPES.filter((a) => a.tier === 'minor').map((a) => a.id)).slice(0, RUN_FACTIONS.minors);
  const chosen = [rng.pick(RUN_FACTIONS.threat), rng.pick(RUN_FACTIONS.aloof), ...minors];
  const factions: Faction[] = [];
  const usedNames = new Set<string>([builders.name]);
  for (const [i, archId] of chosen.entries()) {
    const arch = ARCHETYPES.find((a) => a.id === archId)!;
    let name = '';
    for (let tries = 0; tries < 20 && (!name || usedNames.has(name)); tries++) {
      name = rng
        .pick(arch.names)
        .replace('{gen}', () => makeName(rng, arch.style))
        .replace('{word}', () => rng.pick(arch.words ?? ['Unnamed']))
        .replace('{builders}', builders.name);
    }
    usedNames.add(name);
    const biomeCount = arch.tier === 'major' ? 3 : 2;
    factions.push({
      id: `f${i + 1}`,
      archetype: arch.id,
      tier: arch.tier,
      name,
      article: arch.article,
      biomes: rng.shuffle(BIOMES.slice()).slice(0, biomeCount),
      standing: rng.int(arch.standing[0], arch.standing[1]),
    });
  }
  return { builders, factions };
}

/** "the Rustwake Company" (lower-case article; capitalise at sentence start). */
export function factionName(f: Faction): string {
  return f.article ? `the ${f.name}` : f.name;
}

export function standingLabel(standing: number): string {
  return STANDING_LABEL[clampStanding(standing)]!;
}

export function clampStanding(n: number): number {
  return Math.max(MIN_STANDING, Math.min(MAX_STANDING, Math.round(n)));
}

/** Hazard a faction adds to a world it is on: hostile 2, distrustful 1, otherwise 0. */
export function factionDanger(standing: number): number {
  return standing <= -2 ? 2 : standing === -1 ? 1 : 0;
}

/** Who the builders were, in two sentences. */
export function buildersText(b: Builders): string {
  const devotion = DEVOTIONS.find((d) => d.id === b.devotion)!;
  const fall = FALLS.find((f) => f.id === b.fall)!;
  return `The rings were built by the ${b.name}, who ${devotion.belief}. Then they ${fall.ending}.`;
}

/** A faction's description with names filled in. */
export function factionBlurb(f: Faction, setting: Setting): string {
  const arch = ARCHETYPES.find((a) => a.id === f.archetype)!;
  return fill(arch.blurb, { faction: factionName(f), builders: setting.builders.name });
}

/** Replace {tokens}; a sentence starting with a token is capitalised. */
export function fill(template: string, values: Record<string, string>): string {
  const out = template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
  return capitalize(out);
}
