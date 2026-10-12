/**
 * Addresses, dial feedback and fragment clues. Pure functions only.
 *
 * An address is an ordered list of distinct glyphs (6 for ordinary worlds,
 * 7 for the final address). A dial attempt is scored per glyph:
 *   - 'locked'   : this glyph is in this slot
 *   - 'drifting' : this glyph is in the address, but in another slot
 *   - 'absent'   : this glyph is not in the address at all
 */

import { FAMILIES, GLYPH_IDS, type GlyphId, familyOf, isGlyphId } from './glyphs';
import type { Rng } from './rng';

export type Address = readonly GlyphId[];

export const STANDARD_ADDRESS_LENGTH = 6;
export const FINAL_ADDRESS_LENGTH = 7;

export type Mark = 'locked' | 'drifting' | 'absent';

/**
 * A random address. With `grammar` (the default) it follows the family
 * rule: one glyph from each family (as many families as fit), any extra
 * glyphs drawn from the rest, all in random order.
 */
export function generateAddress(rng: Rng, length: number = STANDARD_ADDRESS_LENGTH, grammar = true): GlyphId[] {
  if (length < 1 || length > GLYPH_IDS.length) {
    throw new Error(`Invalid address length ${length}`);
  }
  if (!grammar) return rng.sample(GLYPH_IDS, length);
  const families = rng.shuffle(FAMILIES).slice(0, Math.min(length, FAMILIES.length));
  const picked: GlyphId[] = families.map((f) => rng.pick(f.glyphs));
  const rest = GLYPH_IDS.filter((g) => !picked.includes(g));
  picked.push(...rng.sample(rest, length - picked.length));
  return rng.shuffle(picked);
}

/** Does this address follow the family rule? */
export function followsGrammar(address: Address): boolean {
  const counts = new Map<string, number>();
  for (const g of address) counts.set(familyOf(g), (counts.get(familyOf(g)) ?? 0) + 1);
  const families = Math.min(address.length, FAMILIES.length);
  return counts.size === families && [...counts.values()].reduce((a, c) => a + Math.max(0, c - 1), 0) === address.length - families;
}

export type GuessProblem =
  | { kind: 'length'; expected: number; actual: number }
  | { kind: 'unknown-glyph'; slot: number; value: string }
  | { kind: 'repeat'; glyph: GlyphId; slots: [number, number] };

/** Returns null if the guess is a legal attempt for an address of `length`. */
export function validateGuess(guess: readonly string[], length: number): GuessProblem | null {
  if (guess.length !== length) return { kind: 'length', expected: length, actual: guess.length };
  const seen = new Map<GlyphId, number>();
  for (let i = 0; i < guess.length; i++) {
    const value = guess[i] as string;
    if (!isGlyphId(value)) return { kind: 'unknown-glyph', slot: i, value };
    const prev = seen.get(value);
    if (prev !== undefined) return { kind: 'repeat', glyph: value, slots: [prev, i] };
    seen.set(value, i);
  }
  return null;
}

/**
 * Score a guess against the address. Both must be valid (same length, no
 * repeats), so each guessed glyph maps to exactly one mark.
 */
export function scoreGuess(address: Address, guess: Address): Mark[] {
  if (guess.length !== address.length) {
    throw new Error(`Guess length ${guess.length} does not match address length ${address.length}`);
  }
  const problem = validateGuess(guess, address.length);
  if (problem) throw new Error(`Invalid guess: ${problem.kind}`);
  const inAddress = new Set(address);
  return guess.map((glyph, slot) => {
    if (address[slot] === glyph) return 'locked';
    return inAddress.has(glyph) ? 'drifting' : 'absent';
  });
}

export function isSolved(marks: readonly Mark[]): boolean {
  return marks.length > 0 && marks.every((m) => m === 'locked');
}

export function countMarks(marks: readonly Mark[]): Record<Mark, number> {
  const counts: Record<Mark, number> = { locked: 0, drifting: 0, absent: 0 };
  for (const m of marks) counts[m]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Facts: what fragments (and puzzle aids) tell the player about an address.
// ---------------------------------------------------------------------------

export type Fact =
  /** "Slot n holds glyph X" */
  | { kind: 'inSlot'; glyph: GlyphId; slot: number }
  /** "Glyph X is not in slot n" */
  | { kind: 'notInSlot'; glyph: GlyphId; slot: number }
  /** "Glyph X is somewhere in the address" */
  | { kind: 'present'; glyph: GlyphId }
  /** "Glyph X is not in the address" */
  | { kind: 'absent'; glyph: GlyphId };

export function factHolds(address: Address, fact: Fact): boolean {
  switch (fact.kind) {
    case 'inSlot':
      return address[fact.slot] === fact.glyph;
    case 'notInSlot':
      return fact.slot >= 0 && fact.slot < address.length && address[fact.slot] !== fact.glyph;
    case 'present':
      return address.includes(fact.glyph);
    case 'absent':
      return !address.includes(fact.glyph);
  }
}

export function factKey(fact: Fact): string {
  return 'slot' in fact ? `${fact.kind}:${fact.glyph}:${fact.slot}` : `${fact.kind}:${fact.glyph}`;
}

/** Human-readable text for a fact. Slots are shown 1-based. */
export function describeFact(fact: Fact, name: (g: GlyphId) => string): string {
  switch (fact.kind) {
    case 'inSlot':
      return `${name(fact.glyph)} sits in slot ${fact.slot + 1}.`;
    case 'notInSlot':
      return `${name(fact.glyph)} is not in slot ${fact.slot + 1}.`;
    case 'present':
      return `${name(fact.glyph)} is somewhere in the address.`;
    case 'absent':
      return `${name(fact.glyph)} is not part of the address.`;
  }
}

export interface FragmentSpec {
  /** Number of slots revealed outright. */
  knownSlots: number;
  /** Number of additional partial clues (notInSlot / present / absent). */
  clues: number;
}

/**
 * Generate the facts a set of recovered fragments gives about `address`.
 * Every fact returned is true for the address, and none are duplicates.
 * Partial clues never concern a slot that is already revealed, so they
 * always carry some information.
 */
export function generateFragmentFacts(rng: Rng, address: Address, spec: FragmentSpec): Fact[] {
  const length = address.length;
  const knownCount = Math.max(0, Math.min(spec.knownSlots, length));
  const knownSlots = rng.sample(
    address.map((_, i) => i),
    knownCount,
  );
  const facts: Fact[] = knownSlots
    .sort((a, b) => a - b)
    .map((slot) => ({ kind: 'inSlot', glyph: address[slot] as GlyphId, slot }));

  const known = new Set(knownSlots);
  const unknownSlots = address.map((_, i) => i).filter((i) => !known.has(i));
  const hiddenGlyphs = unknownSlots.map((i) => address[i] as GlyphId);
  const outsideGlyphs = GLYPH_IDS.filter((g) => !address.includes(g));
  const keys = new Set(facts.map(factKey));

  // Nothing left to hint at if every slot is known.
  if (unknownSlots.length === 0) return facts;

  let guard = 0;
  let added = 0;
  while (added < spec.clues && guard++ < spec.clues * 50) {
    const roll = rng.next();
    let fact: Fact;
    if (roll < 0.45 && unknownSlots.length > 1) {
      // A hidden glyph is not in some other unknown slot.
      const glyph = rng.pick(hiddenGlyphs);
      const actual = address.indexOf(glyph);
      const slot = rng.pick(unknownSlots.filter((s) => s !== actual));
      fact = { kind: 'notInSlot', glyph, slot };
    } else if (roll < 0.75) {
      fact = { kind: 'absent', glyph: rng.pick(outsideGlyphs) };
    } else {
      fact = { kind: 'present', glyph: rng.pick(hiddenGlyphs) };
    }
    const key = factKey(fact);
    if (keys.has(key)) continue;
    keys.add(key);
    facts.push(fact);
    added++;
  }
  return facts;
}

/**
 * One new fact about `address` that is not already in `known`, for a
 * recovered fragment. 'major' reveals an unknown slot outright (falling back
 * to a clue when every slot is known); 'minor' gives a partial clue.
 * `knownSlots` lists slots the player already knows by other means (e.g. a
 * locked dial result). Returns null when nothing new can be said.
 */
export function extraFact(
  rng: Rng,
  address: Address,
  known: readonly Fact[],
  strength: 'major' | 'minor',
  knownSlots: ReadonlySet<number> = new Set(),
): Fact | null {
  const keys = new Set(known.map(factKey));
  const slotKnown = (i: number) => knownSlots.has(i) || known.some((f) => f.kind === 'inSlot' && f.slot === i);
  const hidden = address.map((_, i) => i).filter((i) => !slotKnown(i));

  if (strength === 'major' && hidden.length > 0) {
    const slot = rng.pick(hidden);
    return { kind: 'inSlot', glyph: address[slot] as GlyphId, slot };
  }

  const candidates: Fact[] = [];
  for (const g of GLYPH_IDS) {
    if (!address.includes(g)) candidates.push({ kind: 'absent', glyph: g });
  }
  for (const i of hidden) {
    const glyph = address[i] as GlyphId;
    candidates.push({ kind: 'present', glyph });
    for (const s of hidden) if (s !== i) candidates.push({ kind: 'notInSlot', glyph, slot: s });
  }
  const fresh = candidates.filter((f) => !keys.has(factKey(f)));
  return fresh.length ? rng.pick(fresh) : null;
}
