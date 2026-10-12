import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters';
import { BIOMES, type EncounterDef, validateEncounters } from '../src/game/encounter';
import { Rng } from '../src/game/rng';
import { generateSetting } from '../src/game/setting';
import { MAX_ENCOUNTERS, MIN_ENCOUNTERS, generateWorldProfile, openWorld, poolFor, probeWorld } from '../src/game/world';

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

describe('worlds', () => {
  const setting = generateSetting(new Rng('content'));

  it('a visit is reproducible and draws distinct encounters from its biome pool', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateWorldProfile(i, setting);
      const w = openWorld(p, setting, i, ENCOUNTERS);
      expect(openWorld(generateWorldProfile(i, setting), setting, i, ENCOUNTERS)).toEqual(w);
      expect(w.encounters.length).toBeGreaterThanOrEqual(MIN_ENCOUNTERS);
      expect(w.encounters.length).toBeLessThanOrEqual(MAX_ENCOUNTERS);
      expect(new Set(w.encounters).size).toBe(w.encounters.length);
      const pool = new Set(poolFor(w.biome, ENCOUNTERS).map((d) => d.id));
      for (const id of w.encounters) expect(pool.has(id)).toBe(true);
      expect(w.hazard).toBeGreaterThanOrEqual(1);
      expect(w.hazard).toBeLessThanOrEqual(5);
    }
  });

  it('longer chains on more hazardous worlds', () => {
    const avg = (h: number) => {
      let t = 0;
      for (let i = 0; i < 100; i++) t += openWorld(generateWorldProfile(i, setting, { hazard: h }), setting, i, ENCOUNTERS).encounters.length;
      return t / 100;
    };
    expect(avg(5)).toBeGreaterThan(avg(1) + 1.5);
  });

  it('probe reports hazard, its causes, and a hint from an encounter on this world', () => {
    const w = openWorld(generateWorldProfile('probe', setting, { hazard: 4 }), setting, 'probe', ENCOUNTERS);
    const p = probeWorld(w, setting, ENCOUNTERS);
    expect(p.hazard).toBe(w.hazard);
    expect(p.causes.length).toBeGreaterThan(0);
    const hints = w.encounters.map((id) => ENCOUNTERS.find((d) => d.id === id)!.probeHint);
    expect(hints).toContain(p.hint);
    expect(probeWorld(w, setting, ENCOUNTERS)).toEqual(p);
  });
});
