import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters';
import { type Fact, extraFact, factHolds, factKey, generateAddress } from '../src/game/address';
import { type DecodeState, dial, useAid } from '../src/game/decode';
import { type ExpeditionState, choose, currentEncounter, emergencyDialOut, returnHome } from '../src/game/expedition';
import { Rng } from '../src/game/rng';
import {
  RUN_CONFIG,
  type RunState,
  applyDecode,
  buyItem,
  callUpRecruit,
  canEverDial,
  chargeCapacitor,
  convertSalvage,
  decodeStateFor,
  dialKnownWorld,
  finalLead,
  finalUnlocked,
  finishExcursion,
  healMember,
  isIdentified,
  launch,
  livingTeam,
  newRun,
  openLeads,
  placeFragment,
  probe,
  standDown,
  syncExpedition,
} from '../src/game/run';
import { SAVE_KEY, type KeyValueStorage, checkRun, clearSave, deserialize, loadRun, saveRun } from '../src/game/save';

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Solve a lead by dialling its true address. */
function solve(run: RunState, leadId: string): RunState {
  const ds = decodeStateFor(run, leadId)!;
  return ok(applyDecode(run, leadId, ok(dial(ds, ds.address)).state)).run;
}

/** Play an expedition to the end: always the first affordable no-check choice, else the first choice with the best member. */
function playThrough(run: RunState, finish: 'home' | 'evac' = 'home'): RunState {
  let exp = run.excursion!.expedition!;
  if (finish === 'evac') return syncExpedition(run, ok(emergencyDialOut(exp)).state);
  while (exp.status === 'encounter') {
    const enc = currentEncounter(exp, ENCOUNTERS)!;
    const c = enc.choices.find((x) => !x.check && (x.powerCost ?? 0) <= exp.power) ?? enc.choices.find((x) => x.check)!;
    const actor = exp.team.find((m) => m.wounds < 3)!;
    exp = ok(choose(exp, ENCOUNTERS, c.id, c.check ? actor.id : null)).state;
  }
  if (exp.status === 'complete') exp = ok(returnHome(exp)).state;
  return syncExpedition(run, exp);
}

const withExpedition = (run: RunState, patch: (e: ExpeditionState) => ExpeditionState): RunState =>
  syncExpedition(run, patch(run.excursion!.expedition!));

describe('newRun', () => {
  it('starts with the configured resources, a full team, recruits, leads and a locked final address', () => {
    const run = newRun('start');
    expect(run.power).toBe(RUN_CONFIG.startPower);
    expect(run.salvage).toBe(RUN_CONFIG.startSalvage);
    expect(run.team).toHaveLength(4);
    expect(run.recruits).toHaveLength(RUN_CONFIG.startRecruits);
    expect(openLeads(run)).toHaveLength(RUN_CONFIG.startLeads);
    const fin = finalLead(run)!;
    expect(fin.address).toHaveLength(7);
    expect(fin.facts).toHaveLength(0);
    expect(finalUnlocked(run)).toBe(false);
    for (const l of run.leads) for (const f of l.facts) expect(factHolds(l.address, f)).toBe(true);
  });

  it('new leads follow the family grammar; leads saved before it do not use the family rule', () => {
    const run = newRun('gram-run');
    for (const l of run.leads) expect(l.grammar).toBe(true);
    expect(decodeStateFor(run, run.leads[0]!.id)!.grammar).toBe(true);
    const legacy = { ...run, leads: run.leads.map(({ grammar: _g, ...l }) => l) };
    expect(decodeStateFor(legacy, run.leads[0]!.id)!.grammar).toBe(false);
  });

  it('is reproducible from its seed', () => {
    expect(newRun('same')).toEqual(newRun('same'));
    expect(newRun('a').leads[0]!.address).not.toEqual(newRun('b').leads[0]!.address);
  });
});

describe('base actions', () => {
  it('generator converts salvage to power', () => {
    const r = ok(convertSalvage({ ...newRun('g'), salvage: 25 }));
    expect(r.run.salvage).toBe(15);
    expect(r.run.power).toBe(RUN_CONFIG.startPower + RUN_CONFIG.generator.power);
    expect(convertSalvage({ ...newRun('g'), salvage: 9 })).toMatchObject({ ok: false, error: { kind: 'no-salvage' } });
  });

  it('infirmary heals one step for salvage, not the healthy', () => {
    const base = newRun('h');
    const run = { ...base, salvage: 30, team: base.team.map((m, i) => (i === 0 ? { ...m, wounds: 2 as const } : m)) };
    const r = ok(healMember(run, run.team[0]!.id));
    expect(r.run.team[0]!.wounds).toBe(1);
    expect(r.run.salvage).toBe(30 - RUN_CONFIG.healCost);
    expect(healMember(run, run.team[1]!.id)).toMatchObject({ ok: false, error: { kind: 'healthy' } });
  });

  it('workshop builds aids for salvage', () => {
    const r = ok(buyItem({ ...newRun('w'), salvage: 20 }, 'eliminate'));
    expect(r.run.items.eliminate).toBe(RUN_CONFIG.startItems.eliminate + 1);
    expect(r.run.salvage).toBe(20 - RUN_CONFIG.itemCost.eliminate);
    expect(buyItem({ ...newRun('w'), salvage: 5 }, 'reveal').ok).toBe(false);
  });

  it('recruits fill empty team slots only', () => {
    const run = newRun('r');
    expect(callUpRecruit(run, run.recruits[0]!.id)).toMatchObject({ ok: false, error: { kind: 'team-full' } });
    const short = { ...run, team: run.team.map((m, i) => (i === 0 ? { ...m, wounds: 3 as const } : m)) };
    const r = ok(callUpRecruit(short, run.recruits[0]!.id));
    expect(livingTeam(r.run)).toHaveLength(4);
    expect(r.run.recruits).toHaveLength(run.recruits.length - 1);
  });

  it('a capacitor is queued for the next dial', () => {
    const r = ok(chargeCapacitor(newRun('c')));
    expect(r.run.freeDials).toBe(1);
    expect(r.run.items.freeDial).toBe(0);
  });
});

describe('decoding leads', () => {
  it('dial attempts spend run power and are remembered on the lead', () => {
    const run = newRun('d');
    const lead = openLeads(run)[0]!;
    const ds = decodeStateFor(run, lead.id)!;
    const wrong = ['cairn', 'weir', 'spindle', 'lantern', 'crest', 'thorn'].filter(() => true) as DecodeState['address'];
    const guess = ds.address.includes(wrong[0]!) ? [...ds.address].reverse() : wrong;
    const after = ok(applyDecode(run, lead.id, ok(dial(ds, guess)).state)).run;
    expect(after.power).toBe(run.power - RUN_CONFIG.dialCost);
    expect(after.leads.find((l) => l.id === lead.id)!.attempts).toHaveLength(1);
    expect(decodeStateFor(after, lead.id)!.attempts).toHaveLength(1);
    expect(after.stats.dials).toBe(1);
  });

  it('aids used in the puzzle come out of the run inventory and their facts persist', () => {
    const run = newRun('aid');
    const lead = openLeads(run)[0]!;
    const ds = ok(useAid(decodeStateFor(run, lead.id)!, 'eliminate')).state;
    const after = ok(applyDecode(run, lead.id, ds)).run;
    expect(after.items.eliminate).toBe(run.items.eliminate - 1);
    expect(after.leads.find((l) => l.id === lead.id)!.facts).toHaveLength(lead.facts.length + 1);
  });

  it('solving opens the world, records it as known, and a probe costs power', () => {
    const run = newRun('solve');
    const lead = openLeads(run)[0]!;
    const after = solve(run, lead.id);
    expect(after.excursion?.leadId).toBe(lead.id);
    expect(after.worlds.map((w) => w.leadId)).toContain(lead.id);
    expect(openLeads(after).map((l) => l.id)).not.toContain(lead.id);
    const probed = ok(probe(after)).run;
    expect(probed.power).toBe(after.power - RUN_CONFIG.probeCost);
    expect(probed.excursion!.probe!.hazard).toBe(after.excursion!.world.hazard);
    expect(probe(probed).ok).toBe(false); // once
  });

  it('the final address is locked until it has enough clues', () => {
    const run = newRun('fin');
    const fin = finalLead(run)!;
    const ds = decodeStateFor(run, fin.id)!;
    expect(applyDecode(run, fin.id, ds)).toMatchObject({ ok: false, error: { kind: 'locked' } });
    const rng = new Rng(1);
    const facts: Fact[] = [];
    for (let i = 0; i < RUN_CONFIG.finalUnlockFacts; i++) facts.push(extraFact(rng, fin.address, facts, 'minor')!);
    const unlocked = { ...run, leads: run.leads.map((l) => (l.final ? { ...l, facts } : l)) };
    expect(finalUnlocked(unlocked)).toBe(true);
    const won = solve(unlocked, fin.id);
    expect(won.excursion!.world.biome).toBe('final');
    expect(won.excursion!.world.hazard).toBe(6);
  });
});

describe('excursions', () => {
  const ready = (seed: string) => solve(newRun(seed), openLeads(newRun(seed))[0]!.id);

  it('a newly opened world stays unidentified until probed or entered', () => {
    const opened = ready('ident');
    const leadId = opened.excursion!.leadId;
    expect(isIdentified(opened, leadId)).toBe(false);
    expect(opened.journal[0]).not.toContain(opened.excursion!.world.name);
    const probed = ok(probe(opened)).run;
    expect(isIdentified(probed, leadId)).toBe(true);
    expect(probed.journal[0]).toContain(opened.excursion!.world.name);
    // Launching without a probe also identifies it.
    expect(isIdentified(ok(launch(opened)).run, leadId)).toBe(true);
    // Standing down unprobed keeps the name secret.
    const closed = ok(standDown(opened)).run;
    expect(isIdentified(closed, leadId)).toBe(false);
    expect(closed.journal.join(' ')).not.toContain(opened.excursion!.world.name);
  });

  it('old saves without the identified flag count as identified', () => {
    const run = ready('legacy');
    const legacy = { ...run, worlds: run.worlds.map(({ identified: _drop, ...w }) => w) };
    expect(isIdentified(legacy, run.excursion!.leadId)).toBe(true);
  });

  it('standing down closes the ring without a trip', () => {
    const r = ok(standDown(ready('sd'))).run;
    expect(r.excursion).toBeNull();
  });

  it('standing down after solving the last lead still leaves something to decode', () => {
    let run = newRun('sd-last');
    for (const l of openLeads(run).slice(1)) run = { ...run, leads: run.leads.map((x) => (x.id === l.id ? { ...x, solved: true } : x)) };
    run = solve(run, openLeads(run)[0]!.id);
    expect(openLeads(run)).toHaveLength(0);
    const after = ok(standDown(run)).run;
    expect(openLeads(after)).toHaveLength(1);
    expect(after.journal[0]).toContain('new partial address');
  });

  it('launch sends the living team with the run power', () => {
    const run = ok(launch(ready('l'))).run;
    const exp = run.excursion!.expedition!;
    expect(exp.team).toHaveLength(4);
    expect(exp.power).toBe(run.power);
  });

  it('a successful return banks the haul, adds the trickle, rests the wounded and counts the visit', () => {
    let run = ok(launch(ready('home'))).run;
    run = withExpedition(run, (e) => ({
      ...e,
      status: 'returned',
      power: 40,
      haul: { salvage: 12, items: { reveal: 1, eliminate: 0, freeDial: 0 }, fragments: [] },
      team: e.team.map((m, i) => (i === 0 ? { ...m, wounds: 2 as const } : i === 1 ? { ...m, wounds: 3 as const } : m)),
    }));
    const before = run;
    const after = ok(finishExcursion(run)).run;
    expect(after.excursion).toBeNull();
    expect(after.power).toBe(40 + RUN_CONFIG.returnTrickle);
    expect(after.salvage).toBe(before.salvage + 12);
    expect(after.items.reveal).toBe(before.items.reveal + 1);
    expect(after.team).toHaveLength(3);
    expect(after.team.find((m) => m.id === before.excursion!.expedition!.team[0]!.id)!.wounds).toBe(1);
    expect(after.fallen.map((m) => m.id)).toEqual([before.excursion!.expedition!.team[1]!.id]);
    expect(after.stats.deaths).toBe(1);
    expect(after.worlds.find((w) => w.leadId === before.excursion!.leadId)!.visits).toBe(1);
  });

  it('a stranded team is lost with its haul', () => {
    let run = ok(launch(ready('strand'))).run;
    run = withExpedition(run, (e) => ({ ...e, status: 'stranded', power: 3, haul: { salvage: 50, items: { reveal: 2, eliminate: 0, freeDial: 0 }, fragments: ['major'] } }));
    const after = ok(finishExcursion(run)).run;
    expect(after.team).toHaveLength(0);
    expect(after.fallen).toHaveLength(4);
    expect(after.salvage).toBe(run.salvage);
    expect(after.status).toBe('active'); // recruits remain
  });

  it('losing the team with no recruits ends the run', () => {
    let run = ok(launch(ready('wipe'))).run;
    run = { ...run, recruits: [] };
    run = withExpedition(run, (e) => ({ ...e, status: 'wiped', team: e.team.map((m) => ({ ...m, wounds: 3 as const })) }));
    const after = ok(finishExcursion({ ...run, recruits: [] }, { ...RUN_CONFIG, recruitChance: 0 })).run;
    expect(after.status).toBe('lost');
    expect(after.lossReason).toBe('no-team');
  });

  it('cannot finish an expedition that has not ended', () => {
    expect(finishExcursion(ok(launch(ready('nf'))).run)).toMatchObject({ ok: false, error: { kind: 'not-ended' } });
  });

  it('known worlds can be redialled: same world, fresh encounters, one dial cost', () => {
    let run = ok(launch(ready('again'))).run;
    run = ok(finishExcursion(playThrough(run))).run;
    const lead = run.worlds[0]!;
    const before = run;
    const r = ok(dialKnownWorld(run, lead.leadId)).run;
    expect(r.power).toBe(before.power - RUN_CONFIG.dialCost);
    expect(r.excursion!.world.name).toBe(lead.name);
    expect(r.excursion!.world.hazard).toBe(lead.hazard);
    expect(r.excursion!.world.biome).toBe(lead.biome);
  });

  it('returning from the final world wins; evacuating does not', () => {
    const run = newRun('win');
    const fin = finalLead(run)!;
    const rng = new Rng(2);
    const facts: Fact[] = [];
    for (let i = 0; i < RUN_CONFIG.finalUnlockFacts; i++) facts.push(extraFact(rng, fin.address, facts, 'minor')!);
    const opened = solve({ ...run, leads: run.leads.map((l) => (l.final ? { ...l, facts } : l)) }, fin.id);
    const launched = ok(launch(opened)).run;
    const evac = ok(finishExcursion(playThrough(launched, 'evac'))).run;
    expect(evac.status).toBe('active');
    const home = withExpedition(launched, (e) => ({ ...e, status: 'returned' }));
    expect(ok(finishExcursion(home)).run.status).toBe('won');
  });
});

describe('fragments', () => {
  it('extraFact is always new and true, and major reveals an unknown slot', () => {
    const rng = new Rng('extra');
    for (let i = 0; i < 300; i++) {
      const address = generateAddress(rng, i % 2 ? 6 : 7);
      const known: Fact[] = [];
      for (let k = 0; k < 6; k++) {
        const strength = rng.chance(0.5) ? 'major' : 'minor';
        const f = extraFact(rng, address, known, strength);
        if (!f) break;
        expect(factHolds(address, f)).toBe(true);
        expect(known.map(factKey)).not.toContain(factKey(f));
        if (strength === 'major' && known.filter((x) => x.kind === 'inSlot').length < address.length) expect(f.kind).toBe('inSlot');
        known.push(f);
      }
    }
  });

  it('placeFragment adds a true clue to a lead or opens a new one, and can feed the final address on hazardous worlds', () => {
    let finalHits = 0;
    for (let i = 0; i < 200; i++) {
      const run = newRun(`frag${i}`);
      const { run: after } = placeFragment(run, 'minor', 5, new Rng(i));
      const changed = after.leads.filter((l) => {
        const was = run.leads.find((x) => x.id === l.id);
        return !was || was.facts.length !== l.facts.length;
      });
      expect(changed).toHaveLength(1);
      for (const l of after.leads) for (const f of l.facts) expect(factHolds(l.address, f)).toBe(true);
      if (changed[0]!.final) finalHits++;
    }
    expect(finalHits / 200).toBeGreaterThan(0.3);
    expect(finalHits / 200).toBeLessThan(0.5);
    // Never on benign worlds.
    for (let i = 0; i < 50; i++) {
      const run = newRun(`safe${i}`);
      const { run: after } = placeFragment(run, 'major', 2, new Rng(i));
      expect(finalLead(after)!.facts).toHaveLength(0);
    }
  });

  it('returning always leaves at least one open lead', () => {
    let run = newRun('leads');
    for (const l of openLeads(run)) run = { ...run, leads: run.leads.map((x) => (x.id === l.id ? { ...x, solved: true } : x)) };
    expect(openLeads(run)).toHaveLength(0);
    run = { ...run, worlds: [], excursion: { leadId: 'L1', world: { seed: 1, name: 'X', biome: 'glass', hazard: 1, encounters: [] }, probe: null, expedition: null } };
    run = ok(launch(run)).run;
    run = withExpedition(run, (e) => ({ ...e, status: 'returned' }));
    expect(openLeads(ok(finishExcursion(run)).run).length).toBeGreaterThanOrEqual(1);
  });
});

describe('the ring falls silent', () => {
  it('canEverDial counts power, capacitors and the generator', () => {
    const run = newRun('silent');
    const broke = { ...run, power: 0, salvage: 0, items: { reveal: 0, eliminate: 0, freeDial: 0 }, freeDials: 0 };
    expect(canEverDial(broke)).toBe(false);
    expect(canEverDial({ ...broke, salvage: 10 })).toBe(true);
    expect(canEverDial({ ...broke, items: { ...broke.items, freeDial: 1 } })).toBe(true);
    expect(canEverDial({ ...broke, power: 10 })).toBe(true);
  });

  it('spending the last dial with nothing left to convert ends the run', () => {
    const run = { ...newRun('last'), power: 10, salvage: 0, items: { reveal: 0, eliminate: 0, freeDial: 0 } };
    const lead = openLeads(run)[0]!;
    const ds = decodeStateFor(run, lead.id)!;
    const wrong = [...ds.address].reverse();
    const after = ok(applyDecode(run, lead.id, ok(dial(ds, wrong)).state)).run;
    expect(after.status).toBe('lost');
    expect(after.lossReason).toBe('no-power');
  });
});

describe('save/load', () => {
  const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };

  it('round-trips a run exactly, including an expedition in progress', () => {
    const store = memory();
    let run = newRun('save');
    run = ok(launch(solve(run, openLeads(run)[0]!.id))).run;
    expect(saveRun(store, run)).toBe(true);
    expect(loadRun(store)).toEqual({ kind: 'ok', run });
  });

  it('reports no save, corrupt JSON and wrong shapes', () => {
    const store = memory();
    expect(loadRun(store)).toEqual({ kind: 'none' });
    store.setItem(SAVE_KEY, '{not json');
    expect(loadRun(store)).toMatchObject({ kind: 'corrupt' });
    expect(deserialize(JSON.stringify({ ...newRun('x'), version: 2 }))).toMatchObject({ kind: 'corrupt', reason: expect.stringContaining('version') });
    expect(checkRun({ ...newRun('x'), power: 'lots' })).toBe('bad power');
    expect(checkRun({ ...newRun('x'), leads: [{}] })).toBe('bad lead');
    clearSave(store);
    expect(store.data.size).toBe(0);
  });

  it('survives storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('full'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(saveRun(broken, newRun('b'))).toBe(false);
    expect(loadRun(broken)).toEqual({ kind: 'none' });
    expect(() => clearSave(broken)).not.toThrow();
  });
});
