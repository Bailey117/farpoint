/**
 * Playtest bots for balance simulation. They play through the public game
 * API only and never read hidden answers:
 *  - the decoder sees only fragment facts and dial feedback and always dials
 *    an address consistent with everything it knows;
 *  - 'careful' weighs odds and payoffs, treats wounds, probes and bails out;
 *  - 'careless' picks choices and actors at random.
 */

import { ENCOUNTERS } from '../src/data/encounters';
import { type DecodeState, createDecode, deriveKnowledge, dial, useAid } from '../src/game/decode';
import type { Choice, Effect, Outcome } from '../src/game/encounter';
import {
  type ExpeditionState,
  choose,
  currentEncounter,
  emergencyDialOut,
  medicTreat,
  returnHome,
  successChance,
} from '../src/game/expedition';
import { GLYPH_IDS, type GlyphId } from '../src/game/glyphs';
import { Rng } from '../src/game/rng';
import {
  RUN_CONFIG,
  type RunState,
  applyDecode,
  buyItem,
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
  probe,
  standDown,
  syncExpedition,
} from '../src/game/run';
import { isAlive } from '../src/game/team';

export type Style = 'careful' | 'careless';

// ---------------------------------------------------------------------------
// Decoding without peeking
// ---------------------------------------------------------------------------

/**
 * A guess consistent with all known facts and feedback (null if none found):
 * locked glyphs stay put, every glyph known to be present is used, nothing
 * known absent or excluded from a slot is placed there. Backtracking search
 * with randomised order.
 */
export function consistentGuess(ds: DecodeState, rng: Rng): GlyphId[] | null {
  const k = deriveKnowledge(ds);
  const n = ds.address.length; // the length is public (6 or 7 slots)
  const slots: (GlyphId | null)[] = k.slotGlyph.slice();
  const used = new Set(slots.filter((g): g is GlyphId => g !== null));
  const required = new Set(GLYPH_IDS.filter((g) => (k.glyphStatus[g] === 'present' || k.glyphStatus[g] === 'locked') && !used.has(g)));
  const unknown = GLYPH_IDS.filter((g) => k.glyphStatus[g] === 'unknown');
  const empty = rng.shuffle([...Array(n).keys()].filter((i) => slots[i] === null));

  const fill = (idx: number): boolean => {
    const missing = [...required].filter((g) => !used.has(g)).length;
    if (empty.length - idx < missing) return false;
    if (idx === empty.length) return missing === 0;
    const i = empty[idx]!;
    const req = rng.shuffle([...required].filter((g) => !used.has(g)));
    const candidates = [...req, ...rng.shuffle(unknown.filter((g) => !used.has(g)))].filter((g) => !k.slotExcluded[i]!.has(g));
    for (const g of candidates) {
      slots[i] = g;
      used.add(g);
      if (fill(idx + 1)) return true;
      used.delete(g);
      slots[i] = null;
    }
    return false;
  };
  return fill(0) ? (slots as GlyphId[]) : null;
}

/**
 * An exploring guess, as a thoughtful player makes while glyphs are still
 * unidentified: try known-present glyphs in new slots (to learn placement)
 * and fill every other slot, including already-solved ones, with untested
 * glyphs (to learn presence). Once every glyph is identified, fall back to a
 * consistent guess.
 */
export function explorerGuess(ds: DecodeState, rng: Rng): GlyphId[] | null {
  const k = deriveKnowledge(ds);
  const n = ds.address.length;
  const identified = GLYPH_IDS.filter((g) => k.glyphStatus[g] === 'present' || k.glyphStatus[g] === 'locked').length;
  const unknown = rng.shuffle(GLYPH_IDS.filter((g) => k.glyphStatus[g] === 'unknown'));
  if (identified >= n || unknown.length === 0) return consistentGuess(ds, rng);
  const slots: (GlyphId | null)[] = Array(n).fill(null);
  const lockedSlots = new Set(k.slotGlyph.flatMap((g, i) => (g ? [i] : [])));
  // Present but unplaced glyphs go to a slot they have not been ruled out of.
  const unplaced = rng.shuffle(GLYPH_IDS.filter((g) => k.glyphStatus[g] === 'present'));
  for (const g of unplaced) {
    const options = rng.shuffle([...Array(n).keys()].filter((i) => !lockedSlots.has(i) && slots[i] === null && !k.slotExcluded[i]!.has(g)));
    if (options.length) slots[options[0]!] = g;
  }
  for (let i = 0; i < n; i++) {
    if (slots[i] !== null) continue;
    slots[i] = unknown.pop() ?? null;
  }
  // Out of untested glyphs: fill remaining slots with what is known to be there.
  for (let i = 0; i < n; i++) if (slots[i] === null) slots[i] = k.slotGlyph[i] ?? null;
  const rest = GLYPH_IDS.filter((g) => !slots.includes(g));
  for (let i = 0; i < n; i++) if (slots[i] === null) slots[i] = rest.shift()!;
  return slots as GlyphId[];
}

/** Decode a lead through the run API. Returns the run and dials used. */
export function decodeLead(run: RunState, leadId: string, rng: Rng, style: Style): { run: RunState; dials: number } {
  let dials = 0;
  for (let guard = 0; guard < 60 && run.status === 'active' && !run.excursion; guard++) {
    let ds = decodeStateFor(run, leadId)!;
    if (ds.status === 'stalled' && ds.aids.freeDial > 0) {
      // Out of power: any player would reach for a capacitor.
      const r = useAid(ds, 'freeDial');
      if (r.ok) {
        const a = applyDecode(run, leadId, r.state);
        if (a.ok) run = a.run;
        continue;
      }
    }
    if (ds.status !== 'active') break;
    const unknownSlots = deriveKnowledge(ds).slotGlyph.filter((g) => g === null).length;
    // Careful players use their aids; careless ones forget them.
    if (style === 'careful') {
      const aid = ds.aids.reveal > 0 && unknownSlots >= 3 ? 'reveal' : ds.aids.eliminate > 0 && ds.attempts.length === 0 ? 'eliminate' : ds.power < ds.dialCost && ds.aids.freeDial > 0 ? 'freeDial' : null;
      if (aid) {
        const r = useAid(ds, aid);
        if (r.ok) {
          const a = applyDecode(run, leadId, r.state);
          if (a.ok) run = a.run;
          continue;
        }
      }
    }
    ds = decodeStateFor(run, leadId)!;
    const guess = style === 'careful' ? explorerGuess(ds, rng) : consistentGuess(ds, rng);
    if (!guess) throw new Error('decoder found no consistent guess');
    const d = dial(ds, guess);
    if (!d.ok) break;
    dials++;
    const a = applyDecode(run, leadId, d.state);
    if (!a.ok) throw new Error(`applyDecode: ${JSON.stringify(a.error)}`);
    run = a.run;
  }
  return { run, dials };
}

// ---------------------------------------------------------------------------
// Expedition choices
// ---------------------------------------------------------------------------

function amountMid(a: number | readonly [number, number]): number {
  return typeof a === 'number' ? a : (a[0] + a[1]) / 2;
}

/** Rough value of an outcome to a careful player. */
function outcomeValue(o: Outcome, exp: ExpeditionState, actorId: string | null): number {
  let v = 0;
  const living = exp.team.filter(isAlive);
  for (const fx of o.effects as readonly Effect[]) {
    switch (fx.kind) {
      case 'salvage':
        v += 0.4 * amountMid(fx.amount);
        break;
      case 'power':
        v += 0.6 * amountMid(fx.amount);
        break;
      case 'item':
        v += 6 * (fx.amount ?? 1);
        break;
      case 'fragment':
        v += fx.strength === 'major' ? 14 : 8;
        break;
      case 'heal':
        v += fx.target === 'all' ? 6 : 3;
        break;
      case 'wound': {
        const chance = fx.chance ?? 1;
        const victims = fx.target === 'all' ? living : fx.target === 'actor' ? living.filter((m) => m.id === actorId) : living;
        const per = victims.map((m) => (m.wounds + fx.amount >= 3 ? 40 : 7 * fx.amount + 4 * m.wounds));
        const harm = fx.target === 'random' ? per.reduce((a, b) => a + b, 0) / Math.max(1, per.length) : per.reduce((a, b) => a + b, 0);
        v -= chance * harm;
        break;
      }
    }
  }
  return v;
}

export function pickChoice(exp: ExpeditionState, rng: Rng, style: Style): { choice: Choice; actor: string | null } {
  const enc = currentEncounter(exp, ENCOUNTERS)!;
  const living = exp.team.filter(isAlive);
  const affordable = enc.choices.filter((c) => (c.powerCost ?? 0) <= exp.power);
  if (style === 'careless') {
    const c = rng.pick(affordable.length ? affordable : enc.choices);
    return { choice: c, actor: c.check ? rng.pick(living).id : null };
  }
  let best: { choice: Choice; actor: string | null; v: number } | null = null;
  for (const c of affordable) {
    const cost = c.powerCost ?? 0;
    // Never spend into the return-trip reserve.
    if (exp.power - cost < exp.config.returnCost + 2) continue;
    const actors = c.check ? living : [null];
    for (const m of actors) {
      const p = m && c.check ? successChance(m, c.check, exp.world.hazard, exp.config) : 1;
      const id = m?.id ?? null;
      const v = p * outcomeValue(c.success, exp, id) + (1 - p) * (c.failure ? outcomeValue(c.failure, exp, id) : 0) - 0.6 * cost;
      if (!best || v > best.v) best = { choice: c, actor: id, v };
    }
  }
  if (best) return best;
  const c = enc.choices.find((x) => !x.powerCost) ?? enc.choices[0]!;
  return { choice: c, actor: c.check ? living[0]!.id : null };
}

/** Play an expedition to its end. */
export function playExpedition(exp: ExpeditionState, rng: Rng, style: Style): ExpeditionState {
  for (let guard = 0; guard < 50; guard++) {
    if (exp.status === 'complete') return (returnHome(exp) as { state: ExpeditionState }).state;
    if (exp.status !== 'encounter') return exp;
    if (style === 'careful') {
      // Medic first.
      const hurt = exp.team.filter((m) => isAlive(m) && m.wounds > 0).sort((a, b) => b.wounds - a.wounds)[0];
      if (hurt) {
        const r = medicTreat(exp, hurt.id);
        if (r.ok) exp = r.state;
      }
      // Bail out when the team is falling apart.
      const living = exp.team.filter(isAlive);
      const critical = living.filter((m) => m.wounds >= 2).length;
      if ((living.length <= 1 || critical >= 2) && exp.power >= exp.config.emergencyCost) {
        return (emergencyDialOut(exp) as { state: ExpeditionState }).state;
      }
    }
    const { choice, actor } = pickChoice(exp, rng, style);
    const r = choose(exp, ENCOUNTERS, choice.id, actor);
    if (!r.ok) throw new Error(`choose: ${JSON.stringify(r.error)}`);
    exp = r.state;
  }
  throw new Error('expedition did not end');
}

// ---------------------------------------------------------------------------
// A whole run
// ---------------------------------------------------------------------------

export interface RunReport {
  seed: string;
  style: Style;
  status: RunState['status'];
  lossReason: RunState['lossReason'];
  expeditions: number;
  dials: number;
  leadsSolved: number;
  dialsPerLead: number[];
  deaths: number;
  recruitsArrived: number;
  finalUnlockedAt: number | null;
  finalAttempts: number;
  stranded: number;
  wiped: number;
  evacuated: number;
  minPower: number;
  hazards: number[];
  why: string;
  finalResults: string[];
}

export function playRun(seed: string, style: Style, maxExpeditions = 80): RunReport {
  const rng = new Rng(`bot-${seed}-${style}`);
  let run = newRun(seed);
  const rep: RunReport = {
    seed, style, status: 'active', lossReason: null, expeditions: 0, dials: 0, leadsSolved: 0, dialsPerLead: [],
    deaths: 0, recruitsArrived: 0, finalUnlockedAt: null, finalAttempts: 0, stranded: 0, wiped: 0, evacuated: 0, minPower: run.power, hazards: [], why: '', finalResults: [],
  };
  let recruitsSeen = new Set(run.recruits.map((m) => m.id));

  for (let loop = 0; loop < 400 && run.status === 'active' && run.stats.expeditions < maxExpeditions; loop++) {
    rep.minPower = Math.min(rep.minPower, run.power);
    if (run.excursion) {
      const ex = run.excursion;
      if (!ex.expedition) {
        if (style === 'careful' && run.power >= 50 && !ex.probe && ex.world.biome !== 'final') {
          const p = probe(run);
          if (p.ok) run = p.run;
        }
        const team = livingTeam(run);
        const weak = team.length < 3 || team.some((m) => m.wounds >= 2);
        if (style === 'careful' && run.excursion!.probe && run.excursion!.probe.hazard >= 5 && weak) {
          run = (standDown(run) as { run: RunState }).run;
          continue;
        }
        const l = launch(run);
        if (!l.ok) {
          run = (standDown(run) as { run: RunState }).run;
          continue;
        }
        run = l.run;
        if (ex.world.biome === 'final') rep.finalAttempts++;
        rep.hazards.push(ex.world.hazard);
      }
      const exp = playExpedition(run.excursion!.expedition!, rng, style);
      if (exp.status === 'stranded') rep.stranded++;
      if (exp.status === 'wiped') rep.wiped++;
      if (exp.status === 'evacuated') rep.evacuated++;
      if (exp.world.biome === 'final') rep.finalResults.push(`${exp.status}@${exp.step}/${exp.world.encounters.length} alive ${exp.team.filter(isAlive).length}/${exp.team.length} power ${exp.power}`);
      run = syncExpedition(run, exp);
      const f = finishExcursion(run);
      if (!f.ok) throw new Error('finish');
      run = f.run;
      for (const r of run.recruits) if (!recruitsSeen.has(r.id)) rep.recruitsArrived++;
      recruitsSeen = new Set([...recruitsSeen, ...run.recruits.map((m) => m.id)]);
      if (rep.finalUnlockedAt === null && finalUnlocked(run)) rep.finalUnlockedAt = run.stats.expeditions;
      continue;
    }

    // At base.
    while (livingTeam(run).length < RUN_CONFIG.maxTeam && run.recruits.length) {
      run = (callUpRecruit(run, run.recruits[0]!.id) as { run: RunState }).run;
    }
    if (style === 'careful') {
      for (const m of [...run.team].sort((a, b) => b.wounds - a.wounds)) {
        if (m.wounds > 0 && run.salvage >= RUN_CONFIG.healCost + (run.power < 40 ? RUN_CONFIG.generator.salvage : 0)) {
          const r = healMember(run, m.id);
          if (r.ok) run = r.run;
        }
      }
      while (run.power < 60 && run.salvage >= RUN_CONFIG.generator.salvage) run = (convertSalvage(run) as { run: RunState }).run;
      if (run.salvage >= 60 && run.items.reveal < 2) {
        const r = buyItem(run, 'reveal');
        if (r.ok) run = r.run;
      }
    } else {
      while (run.power < RUN_CONFIG.dialCost && run.salvage >= RUN_CONFIG.generator.salvage) run = (convertSalvage(run) as { run: RunState }).run;
    }
    if (run.status !== 'active') break;
    if (livingTeam(run).length === 0) { rep.why = 'no living team at base'; break; }

    const fin = finalLead(run)!;
    if (fin.solved) {
      if (!canPayDial(run)) { rep.why = 'cannot pay final redial'; break; }
      run = (dialKnownWorld(run, fin.id) as { run: RunState }).run;
      continue;
    }
    const leads = openLeads(run);
    const known = (id: string) => deriveKnowledge(run.leads.find((l) => l.id === id)!).slotGlyph.filter(Boolean).length;
    const target = finalUnlocked(run)
      ? fin
      : style === 'careful'
        ? [...leads].sort((a, b) => known(b.id) - known(a.id))[0]
        : leads[0];
    if (!target) { rep.why = 'no target'; break; }
    const before = run.stats.dials;
    const d = decodeLead(run, target.id, rng, style);
    run = d.run;
    rep.dials += d.dials;
    if (run.excursion) {
      rep.leadsSolved++;
      rep.dialsPerLead.push(run.stats.dials - before);
    } else if (run.status === 'active' && !canPayDial(run) && run.salvage < RUN_CONFIG.generator.salvage && run.items.freeDial === 0) {
      rep.why = `stuck decoding: power ${run.power} salvage ${run.salvage} caps ${run.items.freeDial} charged ${run.freeDials}`;
      break;
    }
  }
  if (!rep.why && run.status === 'active') rep.why = `loop end: power ${run.power} salvage ${run.salvage} caps ${run.items.freeDial} charged ${run.freeDials} team ${livingTeam(run).length} recruits ${run.recruits.length}`;
  rep.status = run.status;
  rep.lossReason = run.lossReason;
  rep.expeditions = run.stats.expeditions;
  rep.deaths = run.stats.deaths;
  return rep;
}

export function summarise(reports: RunReport[]): Record<string, number | string> {
  const n = reports.length;
  const avg = (f: (r: RunReport) => number) => +(reports.reduce((a, r) => a + f(r), 0) / n).toFixed(2);
  const won = reports.filter((r) => r.status === 'won');
  const lossReasons: Record<string, number> = {};
  for (const r of reports) {
    const k = r.status === 'lost' ? `lost:${r.lossReason}` : r.status;
    lossReasons[k] = (lossReasons[k] ?? 0) + 1;
  }
  const dpl = reports.flatMap((r) => r.dialsPerLead).sort((a, b) => a - b);
  const exps = won.map((r) => r.expeditions).sort((a, b) => a - b);
  return {
    runs: n,
    winRate: +(won.length / n).toFixed(2),
    endings: JSON.stringify(lossReasons),
    expeditionsAvg: avg((r) => r.expeditions),
    expeditionsWhenWonMedian: exps.length ? exps[Math.floor(exps.length / 2)]! : 'n/a',
    dialsPerLeadMedian: dpl.length ? dpl[Math.floor(dpl.length / 2)]! : 'n/a',
    dialsPerLeadP90: dpl.length ? dpl[Math.floor(dpl.length * 0.9)]! : 'n/a',
    deathsAvg: avg((r) => r.deaths),
    recruitsArrivedAvg: avg((r) => r.recruitsArrived),
    strandedAvg: avg((r) => r.stranded),
    wipedAvg: avg((r) => r.wiped),
    evacuatedAvg: avg((r) => r.evacuated),
    finalUnlockedRate: +(reports.filter((r) => r.finalUnlockedAt !== null).length / n).toFixed(2),
    finalUnlockedAtAvg: avg((r) => r.finalUnlockedAt ?? 0),
    finalAttemptsAvg: avg((r) => r.finalAttempts),
    minPowerAvg: avg((r) => r.minPower),
  };
}

/** Dial count needed by the honest decoder for a typical lead (no aids). */
export function decoderDials(seed: string, knownSlots: number, clues: number, length = 6, style: Style = 'careful'): number {
  let ds = createDecode(seed, { length, dialCost: 0, fragments: { knownSlots, clues }, power: 0, aids: { reveal: 0, eliminate: 0, freeDial: 0 } });
  const rng = new Rng(`dec-${seed}`);
  let n = 0;
  while (ds.status === 'active' && n < 40) {
    const g = (style === 'careful' ? explorerGuess(ds, rng) : consistentGuess(ds, rng))!;
    ds = (dial(ds, g) as { state: DecodeState }).state;
    n++;
  }
  return n;
}

