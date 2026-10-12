/**
 * The decode puzzle: deduce a world's address from fragments and
 * dial-attempt feedback. Immutable state; every action returns a new state.
 */

import {
  type Address,
  type Fact,
  type FragmentSpec,
  type GuessProblem,
  type Mark,
  STANDARD_ADDRESS_LENGTH,
  factKey,
  generateAddress,
  generateFragmentFacts,
  isSolved,
  scoreGuess,
  validateGuess,
} from './address';
import { FAMILIES, GLYPH_IDS, type GlyphId, familyOf } from './glyphs';
import { Rng, type Seed, deriveSeed } from './rng';

export type AidKind = 'reveal' | 'eliminate' | 'freeDial';

export type AidCharges = Record<AidKind, number>;

export interface Attempt {
  guess: GlyphId[];
  marks: Mark[];
  /** Power actually spent (0 when a free dial was used). */
  cost: number;
}

export type DecodeStatus = 'active' | 'solved' | 'stalled';

export interface DecodeState {
  address: GlyphId[];
  facts: Fact[];
  attempts: Attempt[];
  power: number;
  dialCost: number;
  /** Free dials queued by the freeDial aid; consumed before power. */
  freeDials: number;
  aids: AidCharges;
  status: DecodeStatus;
  /** RNG state for aid effects, so they replay identically. */
  rngState: number;
  /**
   * Whether this address follows the family grammar (one glyph per family).
   * Absent on addresses made before the grammar existed.
   */
  grammar?: boolean;
}

export interface DecodeConfig {
  length: number;
  dialCost: number;
  fragments: FragmentSpec;
  power: number;
  aids: AidCharges;
  /** Follow the family grammar (default true). */
  grammar?: boolean;
}

export const DEFAULT_DECODE_CONFIG: DecodeConfig = {
  length: STANDARD_ADDRESS_LENGTH,
  dialCost: 10,
  fragments: { knownSlots: 2, clues: 3 },
  power: 100,
  aids: { reveal: 1, eliminate: 2, freeDial: 1 },
};

export function createDecode(seed: Seed, config: DecodeConfig = DEFAULT_DECODE_CONFIG): DecodeState {
  const addressRng = new Rng(deriveSeed(seed, 'address'));
  const grammar = config.grammar ?? true;
  const address = generateAddress(addressRng, config.length, grammar);
  const facts = generateFragmentFacts(new Rng(deriveSeed(seed, 'fragments')), address, config.fragments);
  return withStatus({
    address,
    facts,
    attempts: [],
    power: config.power,
    dialCost: config.dialCost,
    freeDials: 0,
    aids: { ...config.aids },
    status: 'active',
    rngState: new Rng(deriveSeed(seed, 'aids')).getState(),
    grammar,
  });
}

/** Can the player afford another dial attempt right now? */
export function canDial(state: DecodeState): boolean {
  return state.status === 'active' && (state.freeDials > 0 || state.power >= state.dialCost);
}

/** Recompute `status` from attempts, power and free dials. */
export function withStatus(state: DecodeState): DecodeState {
  const last = state.attempts[state.attempts.length - 1];
  let status: DecodeStatus;
  if (last && isSolved(last.marks)) status = 'solved';
  else if (state.freeDials > 0 || state.power >= state.dialCost) status = 'active';
  else status = 'stalled';
  return { ...state, status };
}

export type DialError =
  | { kind: 'not-active'; status: DecodeStatus }
  | { kind: 'no-power'; power: number; cost: number }
  | { kind: 'invalid-guess'; problem: GuessProblem };

export type ActionResult<E> = { ok: true; state: DecodeState } | { ok: false; error: E };

export function dial(state: DecodeState, guess: readonly string[]): ActionResult<DialError> {
  if (state.status !== 'active') return { ok: false, error: { kind: 'not-active', status: state.status } };
  const problem = validateGuess(guess, state.address.length);
  if (problem) return { ok: false, error: { kind: 'invalid-guess', problem } };
  const useFree = state.freeDials > 0;
  if (!useFree && state.power < state.dialCost) {
    return { ok: false, error: { kind: 'no-power', power: state.power, cost: state.dialCost } };
  }
  const typedGuess = guess as GlyphId[];
  const cost = useFree ? 0 : state.dialCost;
  const attempt: Attempt = { guess: typedGuess.slice(), marks: scoreGuess(state.address, typedGuess), cost };
  return {
    ok: true,
    state: withStatus({
      ...state,
      attempts: [...state.attempts, attempt],
      power: state.power - cost,
      freeDials: state.freeDials - (useFree ? 1 : 0),
    }),
  };
}

export type AidError =
  | { kind: 'not-active'; status: DecodeStatus }
  | { kind: 'no-charges'; aid: AidKind }
  | { kind: 'nothing-to-reveal' }
  | { kind: 'nothing-to-eliminate' };

/**
 * Apply a puzzle aid:
 *  - reveal:    one unknown slot's glyph becomes known
 *  - eliminate: one glyph not in the address (and not yet known absent) is ruled out
 *  - freeDial:  the next dial attempt costs no power
 * Stalled puzzles may still use aids (a free dial un-stalls them).
 */
export function useAid(state: DecodeState, aid: AidKind): ActionResult<AidError> {
  if (state.status === 'solved') return { ok: false, error: { kind: 'not-active', status: state.status } };
  if (state.aids[aid] <= 0) return { ok: false, error: { kind: 'no-charges', aid } };
  const rng = Rng.fromState(state.rngState);
  const aids = { ...state.aids, [aid]: state.aids[aid] - 1 };
  const knowledge = deriveKnowledge(state);

  let next: DecodeState;
  if (aid === 'reveal') {
    const hidden = state.address.map((_, i) => i).filter((i) => knowledge.slotGlyph[i] === null);
    if (hidden.length === 0) return { ok: false, error: { kind: 'nothing-to-reveal' } };
    const slot = rng.pick(hidden);
    const fact: Fact = { kind: 'inSlot', glyph: state.address[slot] as GlyphId, slot };
    next = { ...state, aids, facts: addFact(state.facts, fact) };
  } else if (aid === 'eliminate') {
    const candidates = GLYPH_IDS.filter(
      (g) => !state.address.includes(g) && knowledge.glyphStatus[g] !== 'absent',
    );
    if (candidates.length === 0) return { ok: false, error: { kind: 'nothing-to-eliminate' } };
    const fact: Fact = { kind: 'absent', glyph: rng.pick(candidates) };
    next = { ...state, aids, facts: addFact(state.facts, fact) };
  } else {
    next = { ...state, aids, freeDials: state.freeDials + 1 };
  }
  return { ok: true, state: withStatus({ ...next, rngState: rng.getState() }) };
}

function addFact(facts: readonly Fact[], fact: Fact): Fact[] {
  const key = factKey(fact);
  return facts.some((f) => factKey(f) === key) ? facts.slice() : [...facts, fact];
}

// ---------------------------------------------------------------------------
// Knowledge: what the player has directly learned, for display.
// This only records direct evidence (no constraint solving) so the
// deduction stays with the player.
// ---------------------------------------------------------------------------

export type GlyphStatus = 'unknown' | 'absent' | 'present' | 'locked';

export interface Knowledge {
  glyphStatus: Record<GlyphId, GlyphStatus>;
  /** Glyph known to sit in each slot, or null. */
  slotGlyph: (GlyphId | null)[];
  /** Glyphs known NOT to sit in each slot. */
  slotExcluded: Set<GlyphId>[];
}

const STATUS_RANK: Record<GlyphStatus, number> = { unknown: 0, absent: 1, present: 1, locked: 2 };

export function deriveKnowledge(state: Pick<DecodeState, 'address' | 'facts' | 'attempts'>): Knowledge {
  const length = state.address.length;
  const glyphStatus = Object.fromEntries(GLYPH_IDS.map((g) => [g, 'unknown'])) as Record<GlyphId, GlyphStatus>;
  const slotGlyph: (GlyphId | null)[] = Array.from({ length }, () => null);
  const slotExcluded: Set<GlyphId>[] = Array.from({ length }, () => new Set<GlyphId>());

  const raise = (g: GlyphId, s: GlyphStatus) => {
    if (STATUS_RANK[s] > STATUS_RANK[glyphStatus[g]]) glyphStatus[g] = s;
  };

  for (const fact of state.facts) {
    switch (fact.kind) {
      case 'inSlot':
        slotGlyph[fact.slot] = fact.glyph;
        raise(fact.glyph, 'locked');
        break;
      case 'notInSlot':
        slotExcluded[fact.slot]?.add(fact.glyph);
        break;
      case 'present':
        raise(fact.glyph, 'present');
        break;
      case 'absent':
        raise(fact.glyph, 'absent');
        break;
    }
  }
  for (const attempt of state.attempts) {
    attempt.guess.forEach((g, slot) => {
      const mark = attempt.marks[slot];
      if (mark === 'locked') {
        slotGlyph[slot] = g;
        raise(g, 'locked');
      } else if (mark === 'drifting') {
        slotExcluded[slot]?.add(g);
        raise(g, 'present');
      } else {
        raise(g, 'absent');
      }
    });
  }
  return { glyphStatus, slotGlyph, slotExcluded };
}

/** Address as a readonly view, e.g. for the dialing sequence once solved. */
export function solvedAddress(state: DecodeState): Address | null {
  return state.status === 'solved' ? state.address : null;
}

/**
 * Glyphs that could still sit in `slot`, judging only by direct evidence:
 * not known absent, not ruled out of this slot, not known to sit in another
 * slot, and, once every glyph of the address has been identified, one of
 * those glyphs. A solved slot has exactly its glyph. The true glyph is
 * always included.
 */
export function slotCandidates(k: Knowledge, slot: number, grammar = false): GlyphId[] {
  const known = k.slotGlyph[slot];
  if (known) return [known];
  const length = k.slotGlyph.length;
  const placed = new Set(k.slotGlyph.filter((g): g is GlyphId => g !== null));
  const identified = GLYPH_IDS.filter((g) => k.glyphStatus[g] === 'present' || k.glyphStatus[g] === 'locked');
  const allIdentified = identified.length >= length;
  const familyOpen = grammar ? familyCapacity(k, length) : () => true;
  return GLYPH_IDS.filter(
    (g) =>
      k.glyphStatus[g] !== 'absent' &&
      !placed.has(g) &&
      !k.slotExcluded[slot]!.has(g) &&
      (!allIdentified || k.glyphStatus[g] === 'present') &&
      (k.glyphStatus[g] === 'present' || familyOpen(g)),
  );
}

/**
 * Glyphs worth placing in a slot. For an open slot, its candidates. For a
 * solved slot, its own glyph plus any glyph that could still sit in an open
 * slot: testing one there is a useful probe, anything else is a wasted test.
 */
export function pickableGlyphs(k: Knowledge, slot: number, grammar = false): GlyphId[] {
  if (k.slotGlyph[slot] === null) return slotCandidates(k, slot, grammar);
  const keep = new Set<GlyphId>([k.slotGlyph[slot]!]);
  k.slotGlyph.forEach((g, i) => {
    if (g === null) for (const c of slotCandidates(k, i, grammar)) keep.add(c);
  });
  return GLYPH_IDS.filter((g) => keep.has(g));
}

/**
 * Family rule: could an as-yet-unidentified glyph still be in the address?
 * Every family has at least one glyph in it; only `length - 6` families (one,
 * for the final address) may have two. A family that already has its share
 * of identified glyphs is closed to the rest of its members.
 */
function familyCapacity(k: Knowledge, length: number): (g: GlyphId) => boolean {
  const count = new Map<string, number>();
  for (const g of GLYPH_IDS) {
    if (k.glyphStatus[g] === 'present' || k.glyphStatus[g] === 'locked') count.set(familyOf(g), (count.get(familyOf(g)) ?? 0) + 1);
  }
  const extras = Math.max(0, length - FAMILIES.length);
  const extrasUsed = [...count.values()].reduce((a, c) => a + Math.max(0, c - 1), 0);
  const extraLeft = extras - extrasUsed;
  return (g) => (count.get(familyOf(g)) ?? 0) === 0 || extraLeft > 0;
}
