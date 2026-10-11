import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, hashSeed } from '../src/game/rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng('farpoint');
    const b = new Rng('farpoint');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('can be resumed from saved state', () => {
    const a = new Rng(42);
    a.next();
    a.next();
    const resumed = Rng.fromState(a.getState());
    expect(resumed.next()).toEqual(a.next());
  });

  it('keeps values in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('shuffle is a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new Rng(3).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });

  it('derived seeds are stable and label-dependent', () => {
    expect(deriveSeed('s', 'a')).toEqual(deriveSeed('s', 'a'));
    expect(deriveSeed('s', 'a')).not.toEqual(deriveSeed('s', 'b'));
    expect(hashSeed('abc')).toEqual(hashSeed('abc'));
  });
});
