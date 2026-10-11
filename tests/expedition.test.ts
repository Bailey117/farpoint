import { describe, expect, it } from 'vitest';
import type { EncounterDef, Outcome } from '../src/game/encounter';
import {
  DEFAULT_EXPEDITION_CONFIG,
  type ExpeditionState,
  applyOutcome,
  canAffordReturn,
  choose,
  currentEncounter,
  emergencyDialOut,
  medicTreat,
  returnHome,
  startExpedition,
  successChance,
} from '../src/game/expedition';
import { Rng } from '../src/game/rng';
import { type Member, effectiveStat, generateTeam } from '../src/game/team';
import type { World } from '../src/game/world';

// --- Fixtures --------------------------------------------------------------

const member = (over: Partial<Member> = {}): Member => ({
  id: 'a',
  name: 'Ada Novak',
  role: 'soldier',
  stats: { grit: 3, insight: 3, rapport: 3 },
  wounds: 0,
  ...over,
});

const TEAM: Member[] = [
  member({ id: 's', name: 'Sol', role: 'soldier', stats: { grit: 4, insight: 1, rapport: 2 } }),
  member({ id: 'c', name: 'Cy', role: 'scientist', stats: { grit: 1, insight: 4, rapport: 2 } }),
  member({ id: 'l', name: 'Lu', role: 'linguist', stats: { grit: 2, insight: 2, rapport: 4 } }),
  member({ id: 'm', name: 'Mo', role: 'medic', stats: { grit: 2, insight: 3, rapport: 3 } }),
];

const DEFS: EncounterDef[] = [
  {
    id: 'e1',
    biome: 'glass',
    title: 'Test one',
    text: 'A test.',
    probeHint: 'Hint one.',
    choices: [
      {
        id: 'check',
        label: 'Gamble',
        check: { stat: 'grit', difficulty: 3, favoredRole: 'soldier' },
        success: { text: '{actor} wins.', effects: [{ kind: 'salvage', amount: 7 }, { kind: 'fragment', strength: 'major' }] },
        failure: { text: '{actor} loses.', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] },
      },
      {
        id: 'pay',
        label: 'Pay',
        powerCost: 12,
        success: { text: 'Paid.', effects: [{ kind: 'item', item: 'reveal' }] },
      },
    ],
  },
  {
    id: 'e2',
    biome: 'glass',
    title: 'Test two',
    text: 'Another.',
    probeHint: 'Hint two.',
    choices: [
      { id: 'safe', label: 'Safe', success: { text: 'Nothing.', effects: [] } },
      { id: 'drain', label: 'Drain', success: { text: 'Drained.', effects: [{ kind: 'power', amount: -30 }] } },
    ],
  },
];

const WORLD: World = { seed: 123, name: 'Testworld', biome: 'glass', hazard: 3, encounters: ['e1', 'e2'] };

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

const start = (power = 50, team = TEAM, world = WORLD) => startExpedition(world, team, power);

// --- Success chance --------------------------------------------------------

describe('successChance', () => {
  const check = { stat: 'grit' as const, difficulty: 3 };

  it('is 50% when stat equals difficulty at hazard 3', () => {
    expect(successChance(member(), check, 3)).toBe(0.5);
  });

  it('moves 15% per stat point', () => {
    expect(successChance(member({ stats: { grit: 4, insight: 3, rapport: 3 } }), check, 3)).toBe(0.65);
    expect(successChance(member({ stats: { grit: 2, insight: 3, rapport: 3 } }), check, 3)).toBe(0.35);
  });

  it('adds the role bonus only for the favoured role', () => {
    const c = { ...check, favoredRole: 'soldier' as const };
    expect(successChance(member({ role: 'soldier' }), c, 3)).toBe(0.65);
    expect(successChance(member({ role: 'medic' }), c, 3)).toBe(0.5);
  });

  it('hazard shifts difficulty by half a point per level', () => {
    expect(successChance(member(), check, 5)).toBe(0.35);
    expect(successChance(member(), check, 1)).toBe(0.65);
  });

  it('wounds reduce the effective stat', () => {
    expect(successChance(member({ wounds: 1 }), check, 3)).toBe(0.35);
    expect(successChance(member({ wounds: 2 }), check, 3)).toBe(0.2);
    expect(effectiveStat(member({ wounds: 2, stats: { grit: 1, insight: 1, rapport: 1 } }), 'grit')).toBe(0);
  });

  it('clamps to 5%..95%, and is 0 for the dead', () => {
    expect(successChance(member({ stats: { grit: 5, insight: 1, rapport: 1 } }), { stat: 'grit', difficulty: 1 }, 1)).toBe(0.95);
    expect(successChance(member({ stats: { grit: 0, insight: 1, rapport: 1 } }), { stat: 'grit', difficulty: 5 }, 5)).toBe(0.05);
    expect(successChance(member({ wounds: 3 }), check, 3)).toBe(0);
  });
});

// --- Resolution ------------------------------------------------------------

describe('choose', () => {
  it('rolls against the shown chance (empirically, over many seeds)', () => {
    let wins = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const s = startExpedition({ ...WORLD, seed: i }, TEAM, 50);
      if (ok(choose(s, DEFS, 'check', 's')).value.success) wins++;
    }
    // Soldier: grit 4 vs 3 = 65% + 15% role bonus = 80%.
    expect(wins / n).toBeGreaterThan(0.77);
    expect(wins / n).toBeLessThan(0.83);
  });

  it('applies the success branch on success and the failure branch on failure', () => {
    let sawWin = false;
    let sawLoss = false;
    for (let i = 0; i < 200 && !(sawWin && sawLoss); i++) {
      const s = startExpedition({ ...WORLD, seed: i }, TEAM, 50);
      const r = ok(choose(s, DEFS, 'check', 'c')); // scientist: grit 1 → 20%
      const actor = r.state.team.find((m) => m.id === 'c')!;
      expect(r.value.chance).toBe(0.2);
      if (r.value.success) {
        sawWin = true;
        expect(r.state.haul.salvage).toBe(7);
        expect(r.state.haul.fragments).toEqual(['major']);
        expect(actor.wounds).toBe(0);
        expect(r.value.text).toBe('Cy wins.');
      } else {
        sawLoss = true;
        expect(r.state.haul.salvage).toBe(0);
        expect(actor.wounds).toBe(1);
        expect(r.value.text).toBe('Cy loses.');
        expect(r.value.applied).toContainEqual({ kind: 'wound', memberId: 'c', from: 0, to: 1, died: false });
      }
    }
    expect(sawWin && sawLoss).toBe(true);
  });

  it('is deterministic for the same world seed and choices', () => {
    const a = ok(choose(start(), DEFS, 'check', 'l'));
    const b = ok(choose(start(), DEFS, 'check', 'l'));
    expect(a).toEqual(b);
  });

  it('advances through the chain and completes after the last encounter', () => {
    let s = start();
    expect(currentEncounter(s, DEFS)?.id).toBe('e1');
    s = ok(choose(s, DEFS, 'pay', null)).state;
    expect(s.step).toBe(1);
    expect(s.status).toBe('encounter');
    expect(currentEncounter(s, DEFS)?.id).toBe('e2');
    s = ok(choose(s, DEFS, 'safe', null)).state;
    expect(s.status).toBe('complete');
    expect(s.log).toHaveLength(2);
    expect(choose(s, DEFS, 'safe', null)).toMatchObject({ ok: false, error: { kind: 'not-in-encounter' } });
  });

  it('charges power costs up front and refuses unaffordable choices', () => {
    const s = ok(choose(start(50), DEFS, 'pay', null));
    expect(s.state.power).toBe(38);
    expect(s.state.haul.items.reveal).toBe(1);
    expect(s.value.applied[0]).toEqual({ kind: 'power', amount: -12 });
    expect(choose(start(11), DEFS, 'pay', null)).toMatchObject({ ok: false, error: { kind: 'no-power', needed: 12, have: 11 } });
  });

  it('requires a living actor for checks', () => {
    expect(choose(start(), DEFS, 'check', null)).toMatchObject({ ok: false, error: { kind: 'actor-required' } });
    expect(choose(start(), DEFS, 'check', 'nobody')).toMatchObject({ ok: false, error: { kind: 'invalid-actor' } });
    const dead = TEAM.map((m) => (m.id === 's' ? { ...m, wounds: 3 as const } : m));
    expect(choose(start(50, dead), DEFS, 'check', 's')).toMatchObject({ ok: false, error: { kind: 'invalid-actor' } });
  });

  it('rejects unknown choices', () => {
    expect(choose(start(), DEFS, 'nope', null)).toMatchObject({ ok: false, error: { kind: 'unknown-choice' } });
  });

  it('power never goes below zero', () => {
    let s = ok(choose(start(20), DEFS, 'pay', null)).state; // 8 left
    s = ok(choose(s, DEFS, 'drain', null)).state;
    expect(s.power).toBe(0);
    expect(s.log[1]!.applied).toContainEqual({ kind: 'power', amount: -8 });
  });
});

// --- Effects ---------------------------------------------------------------

describe('applyOutcome', () => {
  const run = (outcome: Outcome, team: Member[] = TEAM, actor: string | null = 's', seed = 1) =>
    applyOutcome(start(50, team), outcome, actor, new Rng(seed));

  it('rolls ranged amounts within bounds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = run({ text: '', effects: [{ kind: 'salvage', amount: [3, 6] }, { kind: 'power', amount: [5, 9] }] }, TEAM, null, seed);
      expect(r.state.haul.salvage).toBeGreaterThanOrEqual(3);
      expect(r.state.haul.salvage).toBeLessThanOrEqual(6);
      expect(r.state.power).toBeGreaterThanOrEqual(55);
      expect(r.state.power).toBeLessThanOrEqual(59);
    }
  });

  it('a 3-step wound kills, and the dead stay dead', () => {
    const r = run({ text: '', effects: [{ kind: 'wound', target: 'actor', amount: 3 }] });
    const s = r.state.team.find((m) => m.id === 's')!;
    expect(s.wounds).toBe(3);
    expect(r.applied).toContainEqual({ kind: 'wound', memberId: 's', from: 0, to: 3, died: true });
    const healed = applyOutcome(r.state, { text: '', effects: [{ kind: 'heal', target: 'all', amount: 2 }] }, null, new Rng(2));
    expect(healed.state.team.find((m) => m.id === 's')!.wounds).toBe(3);
  });

  it('wounds stack to death across outcomes', () => {
    let st: ExpeditionState = start();
    for (let i = 0; i < 3; i++) st = applyOutcome(st, { text: '', effects: [{ kind: 'wound', target: 'actor', amount: 1 }] }, 'l', new Rng(i)).state;
    expect(st.team.find((m) => m.id === 'l')!.wounds).toBe(3);
  });

  it("'all' hits every living member; 'random' hits exactly one living member", () => {
    const team = TEAM.map((m) => (m.id === 'm' ? { ...m, wounds: 3 as const } : m));
    const all = run({ text: '', effects: [{ kind: 'wound', target: 'all', amount: 1 }] }, team);
    expect(all.state.team.map((m) => m.wounds)).toEqual([1, 1, 1, 3]);
    for (let seed = 0; seed < 50; seed++) {
      const one = run({ text: '', effects: [{ kind: 'wound', target: 'random', amount: 1 }] }, team, null, seed);
      const hit = one.state.team.filter((m, i) => m.wounds !== team[i]!.wounds);
      expect(hit).toHaveLength(1);
      expect(hit[0]!.id).not.toBe('m');
    }
  });

  it('chance wounds land at roughly the given rate and report the spared', () => {
    let landed = 0;
    const n = 1000;
    for (let seed = 0; seed < n; seed++) {
      const r = run({ text: '', effects: [{ kind: 'wound', target: 'actor', amount: 1, chance: 0.3 }] }, TEAM, 's', seed);
      if (r.applied[0]!.kind === 'wound') landed++;
      else expect(r.applied[0]).toEqual({ kind: 'spared', memberId: 's' });
    }
    expect(landed / n).toBeGreaterThan(0.25);
    expect(landed / n).toBeLessThan(0.35);
  });

  it('heals are clamped at healthy and only reported when they change something', () => {
    const team = TEAM.map((m) => (m.id === 'c' ? { ...m, wounds: 2 as const } : m));
    const r = run({ text: '', effects: [{ kind: 'heal', target: 'all', amount: 1 }] }, team);
    expect(r.state.team.map((m) => m.wounds)).toEqual([0, 1, 0, 0]);
    expect(r.applied).toEqual([{ kind: 'heal', memberId: 'c', from: 2, to: 1 }]);
  });

  it('collects items and fragments into the haul', () => {
    const r = run({ text: '', effects: [{ kind: 'item', item: 'freeDial', amount: 2 }, { kind: 'fragment', strength: 'minor' }] });
    expect(r.state.haul.items.freeDial).toBe(2);
    expect(r.state.haul.fragments).toEqual(['minor']);
  });
});

// --- Fail states and returning ---------------------------------------------

describe('ending an expedition', () => {
  const finished = (power: number) => {
    let s = start(power);
    s = ok(choose(s, DEFS, 'pay', null)).state;
    return ok(choose(s, DEFS, 'safe', null)).state;
  };

  it('returns home when the return trip is affordable', () => {
    const s = finished(50); // 38 left
    expect(canAffordReturn(s)).toBe(true);
    const r = ok(returnHome(s));
    expect(r.state.status).toBe('returned');
    expect(r.state.power).toBe(38 - DEFAULT_EXPEDITION_CONFIG.returnCost);
  });

  it('strands the team when the return trip cannot be paid', () => {
    const s = finished(20); // 8 left < 10
    expect(canAffordReturn(s)).toBe(false);
    const r = ok(returnHome(s));
    expect(r.value.stranded).toBe(true);
    expect(r.state.status).toBe('stranded');
    expect(r.state.power).toBe(8);
  });

  it('cannot return before the chain is complete', () => {
    expect(returnHome(start())).toMatchObject({ ok: false, error: { kind: 'not-complete' } });
  });

  it('emergency dial-out ends early at the higher cost, if affordable', () => {
    const r = ok(emergencyDialOut(start(30)));
    expect(r.state.status).toBe('evacuated');
    expect(r.state.power).toBe(30 - DEFAULT_EXPEDITION_CONFIG.emergencyCost);
    expect(emergencyDialOut(start(24))).toMatchObject({ ok: false, error: { kind: 'no-power' } });
    expect(emergencyDialOut(r.state)).toMatchObject({ ok: false, error: { kind: 'ended' } });
  });

  it('wipes when the last member dies', () => {
    const lone = [TEAM[0]!, ...TEAM.slice(1).map((m) => ({ ...m, wounds: 3 as const }))];
    const fatal: EncounterDef[] = [
      { ...DEFS[0]!, choices: [DEFS[0]!.choices[1]!, { id: 'die', label: 'Die', success: { text: 'Gone.', effects: [{ kind: 'wound', target: 'all', amount: 3 }] } }] },
      DEFS[1]!,
    ];
    const r = ok(choose(start(50, lone), fatal, 'die', null));
    expect(r.state.status).toBe('wiped');
    expect(choose(r.state, fatal, 'pay', null).ok).toBe(false);
    expect(emergencyDialOut(r.state).ok).toBe(false);
  });

  it('starting with nobody alive is already a wipe', () => {
    expect(start(50, TEAM.map((m) => ({ ...m, wounds: 3 as const }))).status).toBe('wiped');
  });
});

describe('medicTreat', () => {
  const hurt = TEAM.map((m) => (m.id === 's' ? { ...m, wounds: 2 as const } : m));

  it('heals one wound step once per encounter step', () => {
    const r = ok(medicTreat(start(50, hurt), 's'));
    expect(r.state.team.find((m) => m.id === 's')!.wounds).toBe(1);
    expect(medicTreat(r.state, 's')).toMatchObject({ ok: false, error: { kind: 'medic-used' } });
    // Available again after the next encounter.
    const next = ok(choose(r.state, DEFS, 'pay', null)).state;
    expect(ok(medicTreat(next, 's')).state.team.find((m) => m.id === 's')!.wounds).toBe(0);
  });

  it('needs a medic who is alive and not critical, and a wounded living target', () => {
    expect(medicTreat(start(50, hurt), 'c')).toMatchObject({ ok: false, error: { kind: 'nothing-to-treat' } });
    const medicDown = hurt.map((m) => (m.role === 'medic' ? { ...m, wounds: 2 as const } : m));
    expect(medicTreat(start(50, medicDown), 's')).toMatchObject({ ok: false, error: { kind: 'no-medic' } });
    const deadTarget = TEAM.map((m) => (m.id === 's' ? { ...m, wounds: 3 as const } : m));
    expect(medicTreat(start(50, deadTarget), 's')).toMatchObject({ ok: false, error: { kind: 'nothing-to-treat' } });
  });
});

describe('generateTeam', () => {
  it('builds one of each role with stats in range, reproducibly', () => {
    const t = generateTeam(new Rng('team'));
    expect(t.map((m) => m.role)).toEqual(['soldier', 'scientist', 'linguist', 'medic']);
    for (const m of t) for (const v of Object.values(m.stats)) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(5);
    expect(generateTeam(new Rng('team'))).toEqual(t);
  });
});
