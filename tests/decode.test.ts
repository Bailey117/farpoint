import { describe, expect, it } from 'vitest';
import { factHolds } from '../src/game/address';
import {
  type DecodeConfig,
  type DecodeState,
  DEFAULT_DECODE_CONFIG,
  canDial,
  createDecode,
  deriveKnowledge,
  dial,
  useAid,
} from '../src/game/decode';
import { GLYPH_IDS, type GlyphId } from '../src/game/glyphs';

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** A guess containing no glyph of the address. */
function wrongGuess(state: DecodeState): GlyphId[] {
  return GLYPH_IDS.filter((g) => !state.address.includes(g)).slice(0, state.address.length);
}

const cfg = (over: Partial<DecodeConfig> = {}): DecodeConfig => ({ ...DEFAULT_DECODE_CONFIG, ...over });

describe('createDecode', () => {
  it('is reproducible from a seed', () => {
    expect(createDecode('seed-a')).toEqual(createDecode('seed-a'));
    expect(createDecode('seed-a').address).not.toEqual(createDecode('seed-b').address);
  });

  it('only starts with facts true for the address', () => {
    for (let i = 0; i < 50; i++) {
      const s = createDecode(i);
      expect(s.facts.every((f) => factHolds(s.address, f))).toBe(true);
      expect(s.status).toBe('active');
    }
  });

  it('starts stalled when power cannot cover a dial', () => {
    expect(createDecode(1, cfg({ power: 5 })).status).toBe('stalled');
  });
});

describe('dial', () => {
  it('deducts power and records feedback', () => {
    const s0 = createDecode('dial');
    const s1 = ok(dial(s0, wrongGuess(s0))).state;
    expect(s1.power).toBe(s0.power - s0.dialCost);
    expect(s1.attempts).toHaveLength(1);
    expect(s1.attempts[0]?.marks).toEqual(Array(6).fill('absent'));
    expect(s1.status).toBe('active');
    // original is untouched
    expect(s0.attempts).toHaveLength(0);
  });

  it('solves on the exact address', () => {
    const s0 = createDecode('solve');
    const s1 = ok(dial(s0, s0.address)).state;
    expect(s1.status).toBe('solved');
    expect(canDial(s1)).toBe(false);
    const again = dial(s1, s0.address);
    expect(again.ok).toBe(false);
  });

  it('rejects invalid guesses without spending power', () => {
    const s0 = createDecode('bad');
    const repeat = [s0.address[0], s0.address[0], ...s0.address.slice(2)] as string[];
    const r = dial(s0, repeat);
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid-guess', problem: { kind: 'repeat' } } });
    expect(dial(s0, s0.address.slice(0, 3)).ok).toBe(false);
  });

  it('stalls when power runs out, and refuses further dials', () => {
    let s = createDecode('drain', cfg({ power: 25, dialCost: 10, aids: { reveal: 0, eliminate: 0, freeDial: 0 } }));
    s = ok(dial(s, wrongGuess(s))).state;
    expect(s.status).toBe('active');
    s = ok(dial(s, wrongGuess(s))).state;
    expect(s.power).toBe(5);
    expect(s.status).toBe('stalled');
    expect(dial(s, wrongGuess(s))).toMatchObject({ ok: false, error: { kind: 'not-active' } });
  });

  it('solving with the last of the power counts as solved, not stalled', () => {
    const s0 = createDecode('last', cfg({ power: 10, dialCost: 10 }));
    const s1 = ok(dial(s0, s0.address)).state;
    expect(s1.power).toBe(0);
    expect(s1.status).toBe('solved');
  });
});

describe('aids', () => {
  it('freeDial makes the next dial cost nothing, and only the next', () => {
    let s = createDecode('free');
    s = ok(useAid(s, 'freeDial')).state;
    expect(s.aids.freeDial).toBe(DEFAULT_DECODE_CONFIG.aids.freeDial - 1);
    const p = s.power;
    s = ok(dial(s, wrongGuess(s))).state;
    expect(s.power).toBe(p);
    expect(s.attempts[0]?.cost).toBe(0);
    s = ok(dial(s, wrongGuess(s))).state;
    expect(s.power).toBe(p - s.dialCost);
  });

  it('freeDial un-stalls a stalled puzzle', () => {
    let s = createDecode('unstall', cfg({ power: 0 }));
    expect(s.status).toBe('stalled');
    s = ok(useAid(s, 'freeDial')).state;
    expect(s.status).toBe('active');
    expect(canDial(s)).toBe(true);
  });

  it('reveal adds a true slot fact for a previously unknown slot', () => {
    for (let i = 0; i < 30; i++) {
      const s0 = createDecode(`reveal-${i}`);
      const before = deriveKnowledge(s0).slotGlyph;
      const s1 = ok(useAid(s0, 'reveal')).state;
      expect(s1.facts.length).toBe(s0.facts.length + 1);
      const fact = s1.facts[s1.facts.length - 1]!;
      expect(fact.kind).toBe('inSlot');
      expect(factHolds(s1.address, fact)).toBe(true);
      if (fact.kind === 'inSlot') expect(before[fact.slot]).toBeNull();
    }
  });

  it('reveal fails when every slot is known', () => {
    const s0 = createDecode('all-known', cfg({ fragments: { knownSlots: 6, clues: 0 } }));
    expect(useAid(s0, 'reveal')).toMatchObject({ ok: false, error: { kind: 'nothing-to-reveal' } });
  });

  it('eliminate rules out a glyph that is truly absent and was not known absent', () => {
    for (let i = 0; i < 30; i++) {
      const s0 = createDecode(`elim-${i}`);
      const before = deriveKnowledge(s0).glyphStatus;
      const s1 = ok(useAid(s0, 'eliminate')).state;
      const fact = s1.facts[s1.facts.length - 1]!;
      expect(fact.kind).toBe('absent');
      expect(factHolds(s1.address, fact)).toBe(true);
      expect(before[fact.glyph]).not.toBe('absent');
    }
  });

  it('eliminate fails once all absent glyphs are known', () => {
    let s = createDecode('elim-all', cfg({ aids: { reveal: 0, eliminate: 99, freeDial: 0 } }));
    const knownAbsent = Object.values(deriveKnowledge(s).glyphStatus).filter((x) => x === 'absent').length;
    for (let i = 0; i < 18 - knownAbsent; i++) s = ok(useAid(s, 'eliminate')).state;
    expect(Object.values(deriveKnowledge(s).glyphStatus).filter((x) => x === 'absent')).toHaveLength(18);
    expect(useAid(s, 'eliminate')).toMatchObject({ ok: false, error: { kind: 'nothing-to-eliminate' } });
  });

  it('refuses aids with no charges', () => {
    const s = createDecode('none', cfg({ aids: { reveal: 0, eliminate: 0, freeDial: 0 } }));
    expect(useAid(s, 'reveal')).toMatchObject({ ok: false, error: { kind: 'no-charges' } });
  });

  it('aid effects are reproducible', () => {
    const a = ok(useAid(createDecode('rep'), 'eliminate')).state;
    const b = ok(useAid(createDecode('rep'), 'eliminate')).state;
    expect(a).toEqual(b);
  });
});

describe('deriveKnowledge', () => {
  it('reflects dial feedback per glyph and per slot', () => {
    const s0 = createDecode('know', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const a = s0.address;
    const outside = wrongGuess(s0);
    // slot0 correct, slot1 holds a[2] (drifting), rest absent glyphs
    const guess = [a[0]!, a[2]!, ...outside.slice(0, 4)];
    const s1 = ok(dial(s0, guess)).state;
    const k = deriveKnowledge(s1);
    expect(k.glyphStatus[a[0]!]).toBe('locked');
    expect(k.slotGlyph[0]).toBe(a[0]);
    expect(k.glyphStatus[a[2]!]).toBe('present');
    expect(k.slotExcluded[1]?.has(a[2]!)).toBe(true);
    for (const g of outside.slice(0, 4)) expect(k.glyphStatus[g]).toBe('absent');
    expect(k.glyphStatus[a[3]!]).toBe('unknown');
  });
});
