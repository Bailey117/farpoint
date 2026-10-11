/**
 * Whole-run simulation: a simple bot plays many runs start to finish through
 * the public run API. It decodes by dialling the true address (paying for
 * the dial) and otherwise plays honestly. Checks that runs always end
 * (won or lost) without errors and that invariants hold throughout.
 */
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters';
import { dial } from '../src/game/decode';
import { choose, currentEncounter, emergencyDialOut, returnHome, successChance } from '../src/game/expedition';
import {
  type RunState,
  applyDecode,
  callUpRecruit,
  canPayDial,
  convertSalvage,
  decodeStateFor,
  dialKnownWorld,
  finalLead,
  finalUnlocked,
  finishExcursion,
  healMember,
  launch,
  livingTeam,
  newRun,
  openLeads,
  syncExpedition,
} from '../src/game/run';
import { deserialize, serialize } from '../src/game/save';
import { isAlive } from '../src/game/team';

function check(run: RunState) {
  expect(run.power).toBeGreaterThanOrEqual(0);
  expect(run.salvage).toBeGreaterThanOrEqual(0);
  expect(livingTeam(run).length).toBeLessThanOrEqual(4);
  const ids = run.leads.map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  const people = [...run.team, ...run.recruits, ...run.fallen].map((m) => m.id);
  expect(new Set(people).size).toBe(people.length);
  for (const k of Object.values(run.items)) expect(k).toBeGreaterThanOrEqual(0);
}

function playRun(seed: string, maxSteps = 4000): { run: RunState; steps: number; why: string } {
  let why = 'max-steps';
  let run = newRun(seed);
  let steps = 0;
  for (; steps < maxSteps && run.status === 'active'; steps++) {
    check(run);
    // Every state must survive a save/load round trip.
    const reloaded = deserialize(serialize(run));
    expect(reloaded.kind).toBe('ok');

    if (run.excursion) {
      if (!run.excursion.expedition) {
        const r = launch(run);
        if (!r.ok) throw new Error(`launch failed: ${JSON.stringify(r.error)}`);
        run = r.run;
        continue;
      }
      let exp = run.excursion.expedition;
      if (exp.status === 'encounter') {
        const enc = currentEncounter(exp, ENCOUNTERS)!;
        const living = exp.team.filter(isAlive);
        // Bail out if things look grim and it is affordable.
        if (living.length === 1 && living[0]!.wounds >= 2 && exp.power >= exp.config.emergencyCost) {
          exp = emergencyDialOut(exp).ok ? (emergencyDialOut(exp) as { state: typeof exp }).state : exp;
        } else {
          let best: { id: string; actor: string | null; p: number } | null = null;
          for (const c of enc.choices) {
            if ((c.powerCost ?? 0) > exp.power - exp.config.returnCost) continue;
            if (!c.check) { if (!best || best.p < 0.9) best = { id: c.id, actor: null, p: 0.9 }; continue; }
            for (const m of living) {
              const p = successChance(m, c.check, exp.world.hazard, exp.config);
              if (!best || p > best.p) best = { id: c.id, actor: m.id, p };
            }
          }
          best ??= { id: enc.choices.find((c) => !c.powerCost)?.id ?? enc.choices[0]!.id, actor: living[0]!.id, p: 0 };
          const r = choose(exp, ENCOUNTERS, best.id, best.actor);
          if (!r.ok) throw new Error(`choose failed: ${JSON.stringify(r.error)}`);
          exp = r.state;
        }
      } else if (exp.status === 'complete') {
        exp = (returnHome(exp) as { ok: true; state: typeof exp }).state;
      }
      run = syncExpedition(run, exp);
      if (['returned', 'evacuated', 'stranded', 'wiped'].includes(exp.status)) {
        const r = finishExcursion(run);
        if (!r.ok) throw new Error('finish failed');
        run = r.run;
      }
      continue;
    }

    // At base: heal, fill the team, keep power up, then decode or redial.
    for (const m of run.team) if (m.wounds > 0 && run.salvage >= 30) { const r = healMember(run, m.id); if (r.ok) run = r.run; }
    while (livingTeam(run).length < 4 && run.recruits.length) run = (callUpRecruit(run, run.recruits[0]!.id) as { run: RunState }).run;
    while (run.power < 40 && run.salvage >= 10) run = (convertSalvage(run) as { run: RunState }).run;
    if (livingTeam(run).length === 0) { why = 'no-team-at-base'; break; } // settle() will have ended it if no recruits
    const fin = finalLead(run)!;
    const target = !fin.solved && finalUnlocked(run) ? fin : openLeads(run)[0];
    if (fin.solved && canPayDial(run)) {
      // The final world is open: keep going back until it is won.
      run = (dialKnownWorld(run, fin.id) as { run: RunState }).run;
    } else if (target && canPayDial(run)) {
      const ds = decodeStateFor(run, target.id)!;
      const d = dial(ds, ds.address);
      if (!d.ok) throw new Error(`dial failed: ${JSON.stringify(d.error)}`);
      const r = applyDecode(run, target.id, d.state);
      if (!r.ok) throw new Error(`applyDecode failed: ${JSON.stringify(r.error)}`);
      run = r.run;
    } else if (run.worlds.length && canPayDial(run)) {
      const w = fin.solved ? run.worlds.find((x) => x.leadId === fin.id)! : run.worlds[run.worlds.length - 1]!;
      run = (dialKnownWorld(run, w.leadId) as { run: RunState }).run;
    } else {
      why = `stuck: power ${run.power} salvage ${run.salvage} freeDials ${run.freeDials} caps ${run.items.freeDial} leads ${openLeads(run).length} worlds ${run.worlds.length}`;
      break; // stuck: should already be marked lost
    }
  }
  return { run, steps, why };
}

describe('whole-run simulation', () => {
  it('runs always reach an ending without errors, and some are won', () => {
    const endings: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const { run, steps, why } = playRun(`sim-${i}`);
      if (run.status === 'active') {
        const fin = finalLead(run)!;
        const finWorld = run.worlds.find((w) => w.leadId === fin.id);
        console.log(`sim-${i} active after ${steps} steps (${why}): final clues ${fin.facts.length} solved ${fin.solved} final visits ${finWorld?.visits ?? 0} | expeditions ${run.stats.expeditions} deaths ${run.stats.deaths} | worlds ${run.worlds.map((w) => w.hazard).join(',')} | open leads ${openLeads(run).length} | power ${run.power} salvage ${run.salvage}`);
      }
      check(run);
      const key = run.status === 'lost' ? `lost:${run.lossReason}` : run.status;
      (globalThis as { simLen?: number[] }).simLen = [...((globalThis as { simLen?: number[] }).simLen ?? []), run.stats.expeditions];
      endings[key] = (endings[key] ?? 0) + 1;
    }
    const lens = ((globalThis as { simLen?: number[] }).simLen ?? []).sort((a, b) => a - b);
    console.log('simulated endings:', endings, '| expeditions per run: min', lens[0], 'median', lens[Math.floor(lens.length / 2)], 'max', lens[lens.length - 1]);
    expect(endings.active ?? 0).toBe(0);
    expect(endings.won ?? 0).toBeGreaterThan(0);
  });
});
