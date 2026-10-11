import { describe, expect, it } from 'vitest';
import {
  type Fact,
  countMarks,
  factHolds,
  factKey,
  generateAddress,
  generateFragmentFacts,
  isSolved,
  scoreGuess,
  validateGuess,
} from '../src/game/address';
import { GLYPH_IDS, type GlyphId } from '../src/game/glyphs';
import { Rng } from '../src/game/rng';

const ADDR: GlyphId[] = ['cairn', 'weir', 'spindle', 'lantern', 'crest', 'thorn'];

describe('scoreGuess', () => {
  it('marks every glyph locked for the exact address', () => {
    const marks = scoreGuess(ADDR, ADDR);
    expect(marks).toEqual(Array(6).fill('locked'));
    expect(isSolved(marks)).toBe(true);
  });

  it('marks every glyph absent when none are in the address', () => {
    const guess: GlyphId[] = ['hollow', 'tide', 'loom', 'keel', 'gyre', 'fork'];
    expect(scoreGuess(ADDR, guess)).toEqual(Array(6).fill('absent'));
  });

  it('marks every glyph drifting for a full rotation of the address', () => {
    const rotated = [...ADDR.slice(1), ADDR[0] as GlyphId];
    const marks = scoreGuess(ADDR, rotated);
    expect(marks).toEqual(Array(6).fill('drifting'));
    expect(isSolved(marks)).toBe(false);
  });

  it('scores a mixed guess per slot', () => {
    // slot0 cairn: locked; slot1 spindle: drifting (it is in slot 2);
    // slot2 hollow: absent; slot3 lantern: locked; slot4 weir: drifting; slot5 vane: absent
    const guess: GlyphId[] = ['cairn', 'spindle', 'hollow', 'lantern', 'weir', 'vane'];
    expect(scoreGuess(ADDR, guess)).toEqual(['locked', 'drifting', 'absent', 'locked', 'drifting', 'absent']);
    expect(countMarks(scoreGuess(ADDR, guess))).toEqual({ locked: 2, drifting: 2, absent: 2 });
  });

  it('works for 7-glyph addresses', () => {
    const addr7: GlyphId[] = [...ADDR, 'vane'];
    const guess: GlyphId[] = ['vane', 'weir', 'spindle', 'lantern', 'crest', 'thorn', 'cairn'];
    expect(scoreGuess(addr7, guess)).toEqual([
      'drifting', 'locked', 'locked', 'locked', 'locked', 'locked', 'drifting',
    ]);
  });

  it('rejects guesses of the wrong length or with repeats', () => {
    expect(() => scoreGuess(ADDR, ADDR.slice(0, 5))).toThrow();
    expect(() => scoreGuess(ADDR, ['cairn', 'cairn', 'spindle', 'lantern', 'crest', 'thorn'])).toThrow();
  });

  it('counts are consistent with an independent count for random guesses', () => {
    const rng = new Rng('score-fuzz');
    for (let i = 0; i < 500; i++) {
      const addr = generateAddress(rng);
      const guess = rng.sample(GLYPH_IDS, 6);
      const marks = scoreGuess(addr, guess);
      const exact = guess.filter((g, s) => addr[s] === g).length;
      const common = guess.filter((g) => addr.includes(g)).length;
      const c = countMarks(marks);
      expect(c.locked).toBe(exact);
      expect(c.drifting).toBe(common - exact);
      expect(c.absent).toBe(6 - common);
    }
  });
});

describe('validateGuess', () => {
  it('accepts a legal guess', () => {
    expect(validateGuess(ADDR, 6)).toBeNull();
  });
  it('reports wrong length', () => {
    expect(validateGuess(ADDR.slice(0, 4), 6)).toEqual({ kind: 'length', expected: 6, actual: 4 });
  });
  it('reports unknown glyphs', () => {
    expect(validateGuess(['cairn', 'weir', 'nope', 'lantern', 'crest', 'thorn'], 6)).toEqual({
      kind: 'unknown-glyph', slot: 2, value: 'nope',
    });
  });
  it('reports repeats with both slots', () => {
    expect(validateGuess(['cairn', 'weir', 'spindle', 'weir', 'crest', 'thorn'], 6)).toEqual({
      kind: 'repeat', glyph: 'weir', slots: [1, 3],
    });
  });
});

describe('generateAddress', () => {
  it('produces distinct valid glyphs of the requested length', () => {
    const rng = new Rng(9);
    for (const len of [6, 7]) {
      for (let i = 0; i < 100; i++) {
        const a = generateAddress(rng, len);
        expect(a).toHaveLength(len);
        expect(new Set(a).size).toBe(len);
        expect(validateGuess(a, len)).toBeNull();
      }
    }
  });

  it('is reproducible from a seed', () => {
    expect(generateAddress(new Rng('x'))).toEqual(generateAddress(new Rng('x')));
  });
});

describe('fragment facts', () => {
  it('factHolds evaluates each kind', () => {
    const t: Fact[] = [
      { kind: 'inSlot', glyph: 'weir', slot: 1 },
      { kind: 'notInSlot', glyph: 'weir', slot: 0 },
      { kind: 'present', glyph: 'thorn' },
      { kind: 'absent', glyph: 'vane' },
    ];
    const f: Fact[] = [
      { kind: 'inSlot', glyph: 'weir', slot: 0 },
      { kind: 'notInSlot', glyph: 'weir', slot: 1 },
      { kind: 'present', glyph: 'vane' },
      { kind: 'absent', glyph: 'thorn' },
    ];
    for (const fact of t) expect(factHolds(ADDR, fact)).toBe(true);
    for (const fact of f) expect(factHolds(ADDR, fact)).toBe(false);
  });

  it('generates only true, unique facts with the requested counts', () => {
    const rng = new Rng('fragments');
    for (let i = 0; i < 300; i++) {
      const addr = generateAddress(rng, i % 2 ? 6 : 7);
      const spec = { knownSlots: rng.int(0, 3), clues: rng.int(0, 5) };
      const facts = generateFragmentFacts(rng, addr, spec);
      for (const fact of facts) expect(factHolds(addr, fact)).toBe(true);
      expect(new Set(facts.map(factKey)).size).toBe(facts.length);
      expect(facts.filter((f) => f.kind === 'inSlot')).toHaveLength(spec.knownSlots);
      expect(facts.length).toBe(spec.knownSlots + spec.clues);
    }
  });

  it('partial clues never concern already-revealed slots', () => {
    const rng = new Rng('fragments-2');
    for (let i = 0; i < 200; i++) {
      const addr = generateAddress(rng);
      const facts = generateFragmentFacts(rng, addr, { knownSlots: 3, clues: 4 });
      const knownSlots = new Set(facts.flatMap((f) => (f.kind === 'inSlot' ? [f.slot] : [])));
      const knownGlyphs = new Set(facts.flatMap((f) => (f.kind === 'inSlot' ? [f.glyph] : [])));
      for (const f of facts) {
        if (f.kind === 'notInSlot') {
          expect(knownSlots.has(f.slot)).toBe(false);
          expect(knownGlyphs.has(f.glyph)).toBe(false);
        }
        if (f.kind === 'present') expect(knownGlyphs.has(f.glyph)).toBe(false);
      }
    }
  });

  it('returns only slot facts when every slot is known', () => {
    const facts = generateFragmentFacts(new Rng(1), ADDR, { knownSlots: 6, clues: 3 });
    expect(facts).toHaveLength(6);
    expect(facts.every((f) => f.kind === 'inSlot')).toBe(true);
  });
});
