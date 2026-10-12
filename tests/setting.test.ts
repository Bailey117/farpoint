import { describe, expect, it } from 'vitest';
import { ARCHETYPES, BIOME_PARTS, DEVOTIONS, NAME_STYLES, type NameStyleId } from '../src/data/setting';
import { BIOMES, type BiomeId } from '../src/game/encounter';
import { Rng } from '../src/game/rng';
import { knownFactions, newRun, openLeads } from '../src/game/run';
import { type Setting, factionDanger, generateSetting, isPleasant, makeName } from '../src/game/setting';
import { describeWorld, generateWorldProfile, hazardCauses, worldHazard } from '../src/game/world';

const settings = Array.from({ length: 40 }, (_, i) => generateSetting(new Rng(`setting-${i}`)));

describe('names', () => {
  it('every style makes pleasant, capitalised names', () => {
    const rng = new Rng('names');
    for (const style of Object.keys(NAME_STYLES) as NameStyleId[]) {
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const n = makeName(rng, style);
        expect(isPleasant(n), `${style}: ${n}`).toBe(true);
        expect(n[0]).toBe(n[0]!.toUpperCase());
        seen.add(n);
      }
      // Enough variety that a run rarely repeats itself.
      expect(seen.size, style).toBeGreaterThan(120);
    }
  });

  it('never uses a real word or name', () => {
    for (const real of ['masai', 'shaker', 'devil', 'helen', 'coroner']) expect(isPleasant(real), real).toBe(false);
    expect(isPleasant('vorunu')).toBe(true);
  });
});

describe('setting', () => {
  it('is reproducible', () => {
    expect(generateSetting(new Rng('same'))).toEqual(generateSetting(new Rng('same')));
  });

  it('has one threat, one aloof major power and two distinct minor groups, all named differently', () => {
    for (const s of settings) {
      expect(s.factions.map((f) => f.archetype)[0]).toBe('dominion');
      expect(['elders', 'remnant']).toContain(s.factions[1]!.archetype);
      expect(s.factions.filter((f) => f.tier === 'minor')).toHaveLength(2);
      expect(new Set(s.factions.map((f) => f.archetype)).size).toBe(4);
      expect(new Set([s.builders.name, ...s.factions.map((f) => f.name)]).size).toBe(5);
      for (const f of s.factions) {
        const arch = ARCHETYPES.find((a) => a.id === f.archetype)!;
        expect(f.standing).toBeGreaterThanOrEqual(arch.standing[0]);
        expect(f.standing).toBeLessThanOrEqual(arch.standing[1]);
        expect(f.name).not.toMatch(/[{}]/);
        expect(new Set(f.biomes).size).toBe(f.biomes.length);
      }
    }
  });

  it('a run stores its setting and journals the builders', () => {
    const run = newRun('setting-run');
    expect(run.setting).toEqual(newRun('setting-run').setting);
    expect(run.journal.join(' ')).toContain(run.setting.builders.name);
  });
});

/** All worlds from many settings, with their target hazard. */
function* worlds(): Generator<{ s: Setting; biome: BiomeId; target: number; seed: string }> {
  for (const [si, s] of settings.entries()) {
    for (let i = 0; i < 60; i++) {
      yield { s, biome: BIOMES[i % BIOMES.length]!, target: (i % 5) + 1, seed: `w-${si}-${i}` };
    }
  }
}

describe('world coherence', () => {
  it('the hazard asked for is the hazard its parts add up to', () => {
    for (const { s, biome, target, seed } of worlds()) {
      const p = generateWorldProfile(seed, s, { biome, hazard: target });
      expect(worldHazard(p, s)).toBe(target);
      expect(hazardCauses(p, s).length > 0).toBe(target > 1);
    }
  });

  it('every part belongs to the world: biome, builders and faction all fit', () => {
    for (const { s, biome, target, seed } of worlds()) {
      const p = generateWorldProfile(seed, s, { biome, hazard: target });
      const bp = BIOME_PARTS[biome];
      const parts = p.parts!;
      expect(bp.landmarks.map((x) => x.id)).toContain(parts.landmark);
      expect(bp.conditions.map((x) => x.id)).toContain(parts.condition);
      expect(bp.wildlife.map((x) => x.id)).toContain(parts.wildlife);
      if (parts.ruin) {
        expect(bp.ruinPlaces).toContain(parts.ruin.place);
        expect(DEVOTIONS.find((d) => d.id === s.builders.devotion)!.structures).toContain(parts.ruin.structure);
      }
      if (parts.faction) {
        const f = s.factions.find((x) => x.id === parts.faction!.id)!;
        expect(f.biomes).toContain(biome);
        expect(bp.places).toContain(parts.faction.place);
      }
    }
  });

  it('descriptions read cleanly: no leftover tokens, full sentences, correct a/an', () => {
    for (const { s, biome, target, seed } of worlds()) {
      const p = generateWorldProfile(seed, s, { biome, hazard: target });
      const lines = describeWorld(p, s);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(5);
      for (const line of lines) {
        expect(line, line).not.toMatch(/[{}]|\s\s|\bundefined\b|\s[.,]/);
        expect(line, line).toMatch(/^[A-Z].*\.$/);
        expect(line, line).not.toMatch(/\ba [aeiou]/i);
        expect(line, line).not.toMatch(/\ban [^aeiou\s]/i);
      }
      // A faction is named in the text exactly when one is present.
      const f = s.factions.find((x) => x.id === p.parts!.faction?.id);
      for (const other of s.factions) expect(lines.join(' ').includes(other.name)).toBe(other === f);
    }
  });

  it('left to itself, every hazard level is about equally common', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let n = 0;
    for (const [si, s] of settings.entries()) {
      for (let i = 0; i < 100; i++) {
        counts[worldHazard(generateWorldProfile(`free-${si}-${i}`, s), s)]!++;
        n++;
      }
    }
    for (let h = 1; h <= 5; h++) expect(counts[h]! / n, `hazard ${h}`).toBeGreaterThan(0.15);
  });

  it('factions turn up on a good share of worlds, and ruins on most', () => {
    let withFaction = 0;
    let withRuin = 0;
    let n = 0;
    for (const { s, biome, target, seed } of worlds()) {
      const p = generateWorldProfile(seed, s, { biome, hazard: target });
      if (p.parts!.faction) withFaction++;
      if (p.parts!.ruin) withRuin++;
      n++;
    }
    expect(withFaction / n).toBeGreaterThan(0.3);
    expect(withRuin / n).toBeGreaterThan(0.5);
  });

  it('better relations make a faction world safer', () => {
    for (const { s, biome, target, seed } of worlds()) {
      const p = generateWorldProfile(seed, s, { biome, hazard: target });
      const id = p.parts!.faction?.id;
      if (!id) continue;
      const f = s.factions.find((x) => x.id === id)!;
      const allied: Setting = { ...s, factions: s.factions.map((x) => (x.id === id ? { ...x, standing: 3 } : x)) };
      expect(worldHazard(p, allied)).toBe(Math.max(1, target - factionDanger(f.standing)));
    }
  });

  it('a run never gives two worlds the same name', () => {
    const s = settings[0]!;
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateWorldProfile(`uniq-${i}`, s, { taken });
      expect(taken.has(p.name)).toBe(false);
      taken.add(p.name);
    }
  });
});

describe('known factions', () => {
  it('major powers are known from the start; minor groups once you find their world', () => {
    const run = newRun('factions-known');
    expect(knownFactions(run).map((f) => f.tier)).toEqual(['major', 'major']);
    const minor = run.setting.factions.find((f) => f.tier === 'minor')!;
    const lead = openLeads(run)[0]!;
    const profile = generateWorldProfile('met', run.setting, { biome: minor.biomes[0] });
    const visited = { ...run, worlds: [{ leadId: lead.id, profile: { ...profile, parts: { ...profile.parts!, faction: { id: minor.id, place: 'here' } } }, address: lead.address, visits: 0, identified: false }] };
    expect(knownFactions(visited).map((f) => f.id)).not.toContain(minor.id);
    visited.worlds[0]!.identified = true;
    expect(knownFactions(visited).map((f) => f.id)).toContain(minor.id);
  });
});
