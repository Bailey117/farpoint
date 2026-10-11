import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters';
import { BIOMES, type EncounterDef, validateEncounters } from '../src/game/encounter';
import { MAX_ENCOUNTERS, MIN_ENCOUNTERS, generateWorld, poolFor, probeWorld } from '../src/game/world';

describe('encounter content', () => {
  it('passes validation', () => {
    expect(validateEncounters(ENCOUNTERS)).toEqual([]);
  });

  it('every biome has at least 8 encounters of its own', () => {
    for (const b of BIOMES) expect(ENCOUNTERS.filter((e) => e.biome === b).length).toBeGreaterThanOrEqual(8);
  });

  it('every biome can fill the longest chain', () => {
    for (const b of BIOMES) expect(poolFor(b, ENCOUNTERS).length).toBeGreaterThanOrEqual(MAX_ENCOUNTERS);
  });

  it('the validator catches broken content', () => {
    const bad: EncounterDef[] = [
      {
        id: 'x', biome: 'glass', title: 'X', text: 'X', probeHint: 'X',
        choices: [{ id: 'a', label: 'A', check: { stat: 'grit', difficulty: 9 }, success: { text: '{target} hm', effects: [] } }],
      },
    ];
    const problems = validateEncounters(bad);
    expect(problems.some((p) => p.includes('2-3 choices'))).toBe(true);
    expect(problems.some((p) => p.includes('difficulty'))).toBe(true);
    expect(problems.some((p) => p.includes('failure outcome'))).toBe(true);
    expect(problems.some((p) => p.includes('{target}'))).toBe(true);
  });
});

describe('generateWorld', () => {
  it('is reproducible and draws distinct encounters from its biome pool', () => {
    for (let i = 0; i < 200; i++) {
      const w = generateWorld(i, ENCOUNTERS);
      expect(generateWorld(i, ENCOUNTERS)).toEqual(w);
      expect(w.encounters.length).toBeGreaterThanOrEqual(MIN_ENCOUNTERS);
      expect(w.encounters.length).toBeLessThanOrEqual(MAX_ENCOUNTERS);
      expect(new Set(w.encounters).size).toBe(w.encounters.length);
      const pool = new Set(poolFor(w.biome, ENCOUNTERS).map((d) => d.id));
      for (const id of w.encounters) expect(pool.has(id)).toBe(true);
      expect(w.hazard).toBeGreaterThanOrEqual(1);
      expect(w.hazard).toBeLessThanOrEqual(5);
      expect(w.name.length).toBeGreaterThan(2);
    }
  });

  it('longer chains on more hazardous worlds', () => {
    const avg = (h: number) => {
      let t = 0;
      for (let i = 0; i < 100; i++) t += generateWorld(i, ENCOUNTERS, { hazard: h }).encounters.length;
      return t / 100;
    };
    expect(avg(5)).toBeGreaterThan(avg(1) + 1.5);
  });

  it('probe reports hazard and a hint from an encounter on this world', () => {
    const w = generateWorld('probe', ENCOUNTERS);
    const p = probeWorld(w, ENCOUNTERS);
    expect(p.hazard).toBe(w.hazard);
    const hints = w.encounters.map((id) => ENCOUNTERS.find((d) => d.id === id)!.probeHint);
    expect(hints).toContain(p.hint);
    expect(probeWorld(w, ENCOUNTERS)).toEqual(p);
  });
});
