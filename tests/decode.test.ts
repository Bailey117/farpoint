import { describe, expect, it } from 'vitest';
import { factHolds, followsGrammar, generateAddress } from '../src/game/address';
import {
  type DecodeConfig,
  type DecodeState,
  DEFAULT_DECODE_CONFIG,
  canDial,
  createDecode,
  deriveKnowledge,
  dial,
  pickableGlyphs,
  slotCandidates,
  useAid,
} from '../src/game/decode';
import { FAMILIES, GLYPH_IDS, type GlyphId, familyOf } from '../src/game/glyphs';
import { Rng } from '../src/game/rng';

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

describe('slotCandidates', () => {
  it('always contains the true glyph and shrinks as evidence comes in', () => {
    for (let i = 0; i < 60; i++) {
      let s = createDecode(`cand-${i}`, cfg({ power: 1000 }));
      const rng = new Rng(i);
      let prevTotal = Infinity;
      for (let d = 0; d < 6 && s.status === 'active'; d++) {
        const k = deriveKnowledge(s);
        let total = 0;
        s.address.forEach((g, slot) => {
          const c = slotCandidates(k, slot);
          expect(c).toContain(g);
          total += c.length;
        });
        expect(total).toBeLessThanOrEqual(prevTotal);
        prevTotal = total;
        s = ok(dial(s, rng.sample(GLYPH_IDS, 6))).state;
      }
    }
  });

  it('a solved slot has exactly its glyph; absent and placed glyphs are excluded', () => {
    const s0 = createDecode('cand-x', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const a = s0.address;
    const outside = GLYPH_IDS.filter((g) => !a.includes(g));
    const s1 = ok(dial(s0, [a[0]!, a[2]!, ...outside.slice(0, 4)])).state;
    const k = deriveKnowledge(s1);
    expect(slotCandidates(k, 0)).toEqual([a[0]]);
    for (const slot of [1, 2, 3, 4, 5]) {
      const c = slotCandidates(k, slot);
      expect(c).not.toContain(a[0]); // placed in slot 0
      for (const g of outside.slice(0, 4)) expect(c).not.toContain(g); // absent
    }
    expect(slotCandidates(k, 1)).not.toContain(a[2]); // drifting at slot 1, so not there
  });

  it('once every glyph is identified, only identified glyphs remain candidates', () => {
    const s0 = createDecode('cand-all', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const rotated = [...s0.address.slice(1), s0.address[0]!];
    const k = deriveKnowledge(ok(dial(s0, rotated)).state);
    for (let slot = 0; slot < 6; slot++) {
      for (const g of slotCandidates(k, slot)) expect(s0.address).toContain(g);
    }
  });
});

describe('pickableGlyphs', () => {
  it('an open slot offers exactly its candidates', () => {
    const s0 = createDecode('pick-open', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const outside = GLYPH_IDS.filter((g) => !s0.address.includes(g));
    const k = deriveKnowledge(ok(dial(s0, [s0.address[0]!, ...outside.slice(0, 5)])).state);
    for (const grammar of [false, true]) {
      for (let slot = 1; slot < 6; slot++) expect(pickableGlyphs(k, slot, grammar)).toEqual(slotCandidates(k, slot, grammar));
    }
  });

  it('a solved slot offers its glyph plus glyphs still possible in an open slot', () => {
    const s0 = createDecode('pick-solved', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const a = s0.address;
    const outside = GLYPH_IDS.filter((g) => !a.includes(g));
    const k = deriveKnowledge(ok(dial(s0, [a[0]!, ...outside.slice(0, 5)])).state);
    const p = pickableGlyphs(k, 0, true);
    expect(p).toContain(a[0]);
    for (const g of a.slice(1)) expect(p).toContain(g); // the true glyphs of the open slots
    for (const g of outside.slice(0, 5)) expect(p).not.toContain(g); // known absent
    // Glyphs of slot 0's family are closed by the grammar, so not worth testing.
    for (const g of GLYPH_IDS.filter((x) => x !== a[0] && familyOf(x) === familyOf(a[0]!))) expect(p).not.toContain(g);
  });
});

describe('family grammar', () => {
  it('generated addresses use one glyph per family (7-glyph: exactly one family twice)', () => {
    const rng = new Rng('grammar');
    for (let i = 0; i < 300; i++) {
      for (const len of [6, 7]) {
        const a = generateAddress(rng, len);
        expect(followsGrammar(a)).toBe(true);
        const fams = new Set(a.map(familyOf));
        expect(fams.size).toBe(6);
        expect(new Set(a).size).toBe(len);
      }
    }
    // Opting out still gives plain random addresses.
    const plain = Array.from({ length: 200 }, () => generateAddress(rng, 6, false));
    expect(plain.some((a) => !followsGrammar(a))).toBe(true);
  });

  it('candidates under the grammar never exclude the true glyph', () => {
    for (const len of [6, 7]) {
      for (let i = 0; i < 80; i++) {
        let s = createDecode(`gram-${len}-${i}`, cfg({ length: len, power: 1000 }));
        expect(s.grammar).toBe(true);
        const rng = new Rng(`g${i}`);
        for (let d = 0; d < 6 && s.status === 'active'; d++) {
          const k = deriveKnowledge(s);
          s.address.forEach((g, slot) => expect(slotCandidates(k, slot, true)).toContain(g));
          s = ok(dial(s, rng.sample(GLYPH_IDS, len))).state;
        }
      }
    }
  });

  it('identifying a glyph closes the rest of its family (6-glyph address)', () => {
    const s0 = createDecode('gram-close', cfg({ fragments: { knownSlots: 0, clues: 0 } }));
    const a = s0.address;
    const outside = GLYPH_IDS.filter((g) => !a.includes(g));
    // Put a[0] in the wrong slot: it becomes 'present'.
    const s1 = ok(dial(s0, [a[1]!, a[0]!, ...outside.slice(0, 4)])).state;
    const k = deriveKnowledge(s1);
    const fam = FAMILIES.find((f) => (f.glyphs as readonly string[]).includes(a[0]!))!;
    const siblings = fam.glyphs.filter((g) => g !== a[0]);
    for (let slot = 0; slot < 6; slot++) {
      const c = slotCandidates(k, slot, true);
      for (const sib of siblings) expect(c).not.toContain(sib);
      // Without the grammar, the siblings are still possible somewhere.
    }
    expect(siblings.some((sib) => slotCandidates(k, 2, false).includes(sib))).toBe(true);
  });

  it('the final address leaves room for exactly one doubled family', () => {
    const s0 = createDecode('gram-final', cfg({ length: 7, fragments: { knownSlots: 0, clues: 0 } }));
    const a = s0.address;
    const counts = new Map<string, number>();
    for (const g of a) counts.set(familyOf(g), (counts.get(familyOf(g)) ?? 0) + 1);
    const doubled = [...counts.entries()].find(([, c]) => c === 2)![0];
    const pair = a.filter((g) => familyOf(g) === doubled);
    const single = a.find((g) => familyOf(g) !== doubled)!;
    const outside = GLYPH_IDS.filter((g) => !a.includes(g));
    // Identify one glyph of a single family: its siblings stay possible (it might be the doubled one).
    const s1 = ok(dial(s0, [single, ...outside.slice(0, 6)].reverse())).state;
    const sibOfSingle = FAMILIES.find((f) => (f.glyphs as readonly string[]).includes(single))!.glyphs.filter((g) => g !== single && !a.includes(g));
    const k1 = deriveKnowledge(s1);
    const openSlot = k1.slotGlyph.findIndex((g) => g === null);
    expect(sibOfSingle.some((g) => slotCandidates(k1, openSlot, true).includes(g))).toBe(true);
    // Identify both glyphs of the doubled family: now every family with an identified glyph is closed.
    const s2 = ok(dial(s1, [pair[0]!, pair[1]!, single, ...outside.slice(6, 10)].reverse())).state;
    const k2 = deriveKnowledge(s2);
    const slot2 = k2.slotGlyph.findIndex((g) => g === null);
    for (const g of sibOfSingle) expect(slotCandidates(k2, slot2, true)).not.toContain(g);
  });
});
