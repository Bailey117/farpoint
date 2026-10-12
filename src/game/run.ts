/**
 * The run: everything that persists between screens and is saved.
 *
 * Power is one shared reserve, spent on dial attempts, probes, the trip
 * home and emergency dial-outs; it comes back as a trickle on each return,
 * from expedition finds and by converting salvage at the base generator.
 *
 * Addresses: a lead is a partial address the player decodes (attempts are
 * remembered). Fragments add clues to leads or open new ones. Solving a
 * lead opens its world; known worlds can be redialled. The final 7-glyph
 * address gathers clues from hazard 3+ worlds; once it has enough it can be
 * decoded, and dialling it opens the final expedition. Returning home from
 * that expedition wins the run.
 *
 * The run is lost when nobody is left to send (no living team, no
 * recruits), or when the ring can never be dialled again.
 */

import { ENCOUNTERS } from '../data/encounters';
import {
  type Fact,
  FINAL_ADDRESS_LENGTH,
  STANDARD_ADDRESS_LENGTH,
  extraFact,
  generateAddress,
  generateFragmentFacts,
} from './address';
import { type AidCharges, type AidKind, type Attempt, type DecodeState, deriveKnowledge, withStatus } from './decode';
import type { BiomeId, EncounterDef } from './encounter';
import {
  DEFAULT_EXPEDITION_CONFIG,
  ENDED,
  type ExpeditionConfig,
  type ExpeditionState,
  startExpedition,
} from './expedition';
import type { GlyphId } from './glyphs';
import { Rng, deriveSeed } from './rng';
import { type Member, ROLES, changeWounds, generateMember, generateTeam, isAlive } from './team';
import { type ProbeReport, type World, generateFinalWorld, generateWorld, probeWorld } from './world';

/**
 * Balance values. Tuned with the playtest bots in sim/ (`npm run balance`):
 * a careful bot wins roughly 1 run in 3 over ~15 expeditions; a careless
 * one rarely survives past the first few.
 */
export const RUN_CONFIG = {
  startPower: 120,
  startSalvage: 15,
  startItems: { reveal: 1, eliminate: 1, freeDial: 1 } as AidCharges,
  dialCost: 8,
  probeCost: 5,
  /** Base reactor output added every time a team comes home (or is lost). */
  returnTrickle: 7,
  /** Generator: this much salvage buys this much power. */
  generator: { salvage: 10, power: 15 },
  /** Wound steps every survivor recovers for free on coming home. */
  restHeal: 1,
  /** Infirmary: salvage per wound step healed. */
  healCost: 12,
  itemCost: { reveal: 20, eliminate: 10, freeDial: 12 } as Record<AidKind, number>,
  maxTeam: 4,
  startRecruits: 2,
  recruitPoolMax: 3,
  recruitChance: 0.5,
  startLeads: 2,
  maxOpenLeads: 4,
  startLeadFragments: { knownSlots: 1, clues: 2 },
  newLeadFragments: { knownSlots: 0, clues: 2 },
  /** Chance a fragment found on a hazard >= minHazard world belongs to the final address. */
  finalFragment: { chance: 0.3, minHazard: 3 },
  /** Clues needed on the final address before it can be decoded. */
  finalUnlockFacts: 6,
  /** Chance a fragment opens a new lead rather than adding to an existing one. */
  newLeadChance: 0.35,
  expedition: DEFAULT_EXPEDITION_CONFIG as ExpeditionConfig,
};

export type RunConfig = typeof RUN_CONFIG;

export interface Lead {
  id: string;
  final: boolean;
  worldSeed: number;
  address: GlyphId[];
  facts: Fact[];
  attempts: Attempt[];
  /** RNG state for aid effects on this lead. */
  rngState: number;
  solved: boolean;
  /** Follows the family grammar. Absent on leads saved before it existed. */
  grammar?: boolean;
}

export interface KnownWorld {
  leadId: string;
  name: string;
  biome: World['biome'];
  hazard: number;
  address: GlyphId[];
  visits: number;
  /**
   * Whether the world's name and biome are known: set by probing it or by
   * going through. Saves from before this field existed count as identified.
   */
  identified?: boolean;
}

/** Is this world's name known to the player yet? */
export function isIdentified(run: RunState, leadId: string): boolean {
  return run.worlds.find((w) => w.leadId === leadId)?.identified !== false;
}

/** Mark a world as identified (probed or visited). */
function identify(run: RunState, leadId: string): RunState {
  if (isIdentified(run, leadId)) return run;
  return { ...run, worlds: run.worlds.map((w) => (w.leadId === leadId ? { ...w, identified: true } : w)) };
}

/** A world the ring is open to: in briefing until launch, then on expedition. */
export interface Excursion {
  leadId: string;
  world: World;
  probe: ProbeReport | null;
  expedition: ExpeditionState | null;
}

export type RunStatus = 'active' | 'won' | 'lost';
export type LossReason = 'no-team' | 'no-power';

export interface RunStats {
  expeditions: number;
  dials: number;
  deaths: number;
  fragments: number;
}

export interface RunState {
  version: 1;
  seed: string;
  status: RunStatus;
  lossReason: LossReason | null;
  power: number;
  salvage: number;
  items: AidCharges;
  /** Capacitor charges queued for the next dial. */
  freeDials: number;
  team: Member[];
  recruits: Member[];
  fallen: Member[];
  leads: Lead[];
  worlds: KnownWorld[];
  excursion: Excursion | null;
  /** Newest first. */
  journal: string[];
  stats: RunStats;
  nextId: number;
  rngState: number;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Leads are numbered on their own (L1, L2, ...); the final address is 'FINAL'. */
function newLead(leads: readonly Lead[], rng: Rng, final: boolean, fragments: { knownSlots: number; clues: number }): Lead {
  const id = final ? 'FINAL' : `L${leads.filter((l) => !l.final).length + 1}`;
  const worldSeed = Math.floor(rng.next() * 2 ** 32);
  const address = generateAddress(rng, final ? FINAL_ADDRESS_LENGTH : STANDARD_ADDRESS_LENGTH);
  const facts = generateFragmentFacts(rng, address, fragments);
  return { id, final, worldSeed, address, facts, attempts: [], rngState: Math.floor(rng.next() * 2 ** 32), solved: false, grammar: true };
}

export function newRun(seed: string, config: RunConfig = RUN_CONFIG): RunState {
  const rng = new Rng(deriveSeed(seed, 'run'));
  const team = generateTeam(rng);
  const run: RunState = {
    version: 1,
    seed,
    status: 'active',
    lossReason: null,
    power: config.startPower,
    salvage: config.startSalvage,
    items: { ...config.startItems },
    freeDials: 0,
    team,
    recruits: [],
    fallen: [],
    leads: [],
    worlds: [],
    excursion: null,
    journal: ['The ring is quiet. Your team is ready.'],
    stats: { expeditions: 0, dials: 0, deaths: 0, fragments: 0 },
    nextId: 1,
    rngState: 0,
  };
  for (let i = 0; i < config.startRecruits; i++) run.recruits.push(newRecruit(run, rng));
  for (let i = 0; i < config.startLeads; i++) run.leads.push(newLead(run.leads, rng, false, config.startLeadFragments));
  run.leads.push(newLead(run.leads, rng, true, { knownSlots: 0, clues: 0 }));
  run.rngState = rng.getState();
  return run;
}

function newRecruit(run: RunState, rng: Rng): Member {
  const m = generateMember(rng, rng.pick(ROLES), `r${run.nextId}`);
  run.nextId++;
  return m;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function livingTeam(run: RunState): Member[] {
  return run.team.filter(isAlive);
}

export function openLeads(run: RunState): Lead[] {
  return run.leads.filter((l) => !l.solved && !l.final);
}

export function finalLead(run: RunState): Lead | undefined {
  return run.leads.find((l) => l.final);
}

export function finalUnlocked(run: RunState, config: RunConfig = RUN_CONFIG): boolean {
  const f = finalLead(run);
  return !!f && (f.solved || f.facts.length >= config.finalUnlockFacts);
}

/** Can a dial attempt be paid for right now (power or a free dial)? */
export function canPayDial(run: RunState, config: RunConfig = RUN_CONFIG): boolean {
  return run.freeDials > 0 || run.power >= config.dialCost;
}

/** Could the player ever dial again, counting capacitors and the generator? */
export function canEverDial(run: RunState, config: RunConfig = RUN_CONFIG): boolean {
  if (canPayDial(run, config) || run.items.freeDial > 0) return true;
  const affordableCells = Math.floor(run.salvage / config.generator.salvage);
  return run.power + affordableCells * config.generator.power >= config.dialCost;
}

// ---------------------------------------------------------------------------
// Results and helpers
// ---------------------------------------------------------------------------

export type RunError =
  | { kind: 'run-over' }
  | { kind: 'busy' }
  | { kind: 'unknown'; what: string }
  | { kind: 'no-salvage'; needed: number; have: number }
  | { kind: 'no-power'; needed: number; have: number }
  | { kind: 'team-full' }
  | { kind: 'no-team' }
  | { kind: 'healthy' }
  | { kind: 'locked' }
  | { kind: 'not-ended' };

export type RunResult = { ok: true; run: RunState } | { ok: false; error: RunError };

const fail = (error: RunError): RunResult => ({ ok: false, error });

function note(run: RunState, text: string): RunState {
  return { ...run, journal: [text, ...run.journal].slice(0, 40) };
}

/** Re-check end conditions after any change. */
function settle(run: RunState, config: RunConfig): RunState {
  if (run.status !== 'active' || run.excursion) return run;
  if (livingTeam(run).length === 0 && run.recruits.length === 0) {
    return note({ ...run, status: 'lost', lossReason: 'no-team' }, 'There is no one left to send. The run is over.');
  }
  if (!canEverDial(run, config)) {
    return note({ ...run, status: 'lost', lossReason: 'no-power' }, 'The reserve is spent and nothing is left to convert. The ring falls silent.');
  }
  return run;
}

function guard(run: RunState, needIdle = true): RunError | null {
  if (run.status !== 'active') return { kind: 'run-over' };
  if (needIdle && run.excursion) return { kind: 'busy' };
  return null;
}

// ---------------------------------------------------------------------------
// Base actions
// ---------------------------------------------------------------------------

/** Generator: convert salvage into power. */
export function convertSalvage(run: RunState, config: RunConfig = RUN_CONFIG): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const { salvage, power } = config.generator;
  if (run.salvage < salvage) return fail({ kind: 'no-salvage', needed: salvage, have: run.salvage });
  return { ok: true, run: settle({ ...run, salvage: run.salvage - salvage, power: run.power + power }, config) };
}

/** Infirmary: heal one wound step for salvage. */
export function healMember(run: RunState, memberId: string, config: RunConfig = RUN_CONFIG): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const i = run.team.findIndex((m) => m.id === memberId);
  const m = run.team[i];
  if (!m || !isAlive(m)) return fail({ kind: 'unknown', what: memberId });
  if (m.wounds === 0) return fail({ kind: 'healthy' });
  if (run.salvage < config.healCost) return fail({ kind: 'no-salvage', needed: config.healCost, have: run.salvage });
  const team = run.team.slice();
  team[i] = changeWounds(m, -1);
  return { ok: true, run: { ...run, team, salvage: run.salvage - config.healCost } };
}

/** Workshop: build a puzzle aid from salvage. */
export function buyItem(run: RunState, item: AidKind, config: RunConfig = RUN_CONFIG): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const cost = config.itemCost[item];
  if (run.salvage < cost) return fail({ kind: 'no-salvage', needed: cost, have: run.salvage });
  return { ok: true, run: { ...run, salvage: run.salvage - cost, items: { ...run.items, [item]: run.items[item] + 1 } } };
}

/** Bring a recruit from the reserve into the team. */
export function callUpRecruit(run: RunState, recruitId: string, config: RunConfig = RUN_CONFIG): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const r = run.recruits.find((m) => m.id === recruitId);
  if (!r) return fail({ kind: 'unknown', what: recruitId });
  if (livingTeam(run).length >= config.maxTeam) return fail({ kind: 'team-full' });
  return {
    ok: true,
    run: note(
      { ...run, team: [...livingTeam(run), r], recruits: run.recruits.filter((m) => m.id !== recruitId) },
      `${r.name} joins the team.`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Decoding a lead
// ---------------------------------------------------------------------------

/** Build the decode puzzle state for a lead, using the run's power and aids. */
export function decodeStateFor(run: RunState, leadId: string, config: RunConfig = RUN_CONFIG): DecodeState | null {
  const lead = run.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  return withStatus({
    address: lead.address,
    facts: lead.facts,
    attempts: lead.attempts,
    power: run.power,
    dialCost: config.dialCost,
    freeDials: run.freeDials,
    aids: { ...run.items },
    status: 'active',
    rngState: lead.rngState,
    grammar: lead.grammar === true,
  });
}

/**
 * Write a decode state back into the run after any puzzle action. When the
 * lead becomes solved, its world opens (briefing).
 */
export function applyDecode(run: RunState, leadId: string, ds: DecodeState, defs: readonly EncounterDef[] = ENCOUNTERS): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const idx = run.leads.findIndex((l) => l.id === leadId);
  const lead = run.leads[idx];
  if (!lead) return fail({ kind: 'unknown', what: leadId });
  if (lead.final && !finalUnlocked(run)) return fail({ kind: 'locked' });
  const newDials = ds.attempts.length - lead.attempts.length;
  const updated: Lead = { ...lead, facts: ds.facts, attempts: ds.attempts, rngState: ds.rngState, solved: ds.status === 'solved' };
  const leads = run.leads.slice();
  leads[idx] = updated;
  let next: RunState = {
    ...run,
    leads,
    power: ds.power,
    items: { ...ds.aids },
    freeDials: ds.freeDials,
    stats: { ...run.stats, dials: run.stats.dials + Math.max(0, newDials) },
  };
  if (updated.solved && !lead.solved) {
    const world = lead.final ? generateFinalWorld(lead.worldSeed, defs) : generateWorld(lead.worldSeed, defs);
    next = note({ ...next, excursion: { leadId, world, probe: null, expedition: null } }, lead.final ? 'The final address locks. The ring opens on the Farpoint.' : 'Address resolved: the ring opens on an unidentified world.');
    if (!next.worlds.some((w) => w.leadId === leadId)) {
      // The Farpoint is known by name from the start; other worlds must be probed or visited.
      next.worlds = [...next.worlds, { leadId, name: world.name, biome: world.biome, hazard: world.hazard, address: lead.address, visits: 0, identified: lead.final }];
    }
  }
  return { ok: true, run: settle(next, RUN_CONFIG) };
}

/** Redial a world you have already reached: one dial's cost, a fresh chain. */
export function dialKnownWorld(run: RunState, leadId: string, defs: readonly EncounterDef[] = ENCOUNTERS, config: RunConfig = RUN_CONFIG): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  const known = run.worlds.find((w) => w.leadId === leadId);
  const lead = run.leads.find((l) => l.id === leadId);
  if (!known || !lead) return fail({ kind: 'unknown', what: leadId });
  if (!canPayDial(run, config)) return fail({ kind: 'no-power', needed: config.dialCost, have: run.power });
  const useFree = run.freeDials > 0;
  const seed = deriveSeed(lead.worldSeed, `visit-${known.visits}`);
  const base = lead.final ? generateFinalWorld(lead.worldSeed, defs) : generateWorld(lead.worldSeed, defs);
  // Same world (name, biome, hazard), new encounters for each visit.
  const world = lead.final ? base : { ...generateWorld(seed, defs, { biome: base.biome as BiomeId, hazard: base.hazard }), name: base.name };
  return {
    ok: true,
    run: note(
      {
        ...run,
        power: run.power - (useFree ? 0 : config.dialCost),
        freeDials: run.freeDials - (useFree ? 1 : 0),
        stats: { ...run.stats, dials: run.stats.dials + 1 },
        excursion: { leadId, world, probe: null, expedition: null },
      },
      isIdentified(run, leadId) ? `The ring opens on ${world.name} again.` : 'The ring opens on the unidentified world again.',
    ),
  };
}

/** Queue a capacitor for the next dial (from the inventory). */
export function chargeCapacitor(run: RunState): RunResult {
  const g = guard(run);
  if (g) return fail(g);
  if (run.items.freeDial <= 0) return fail({ kind: 'unknown', what: 'capacitor' });
  return { ok: true, run: { ...run, items: { ...run.items, freeDial: run.items.freeDial - 1 }, freeDials: run.freeDials + 1 } };
}

// ---------------------------------------------------------------------------
// Excursions
// ---------------------------------------------------------------------------

export function probe(run: RunState, defs: readonly EncounterDef[] = ENCOUNTERS, config: RunConfig = RUN_CONFIG): RunResult {
  const ex = run.excursion;
  if (run.status !== 'active' || !ex || ex.expedition || ex.probe) return fail({ kind: 'busy' });
  if (run.power < config.probeCost) return fail({ kind: 'no-power', needed: config.probeCost, have: run.power });
  const wasKnown = isIdentified(run, ex.leadId);
  let next: RunState = identify({ ...run, power: run.power - config.probeCost, excursion: { ...ex, probe: probeWorld(ex.world, defs) } }, ex.leadId);
  if (!wasKnown) next = note(next, `The probe identifies the world: ${ex.world.name}.`);
  return { ok: true, run: next };
}

/** If no ordinary lead is open, the archive yields a new one. */
function ensureOpenLead(run: RunState, rng: Rng, config: RunConfig): { run: RunState; message: string | null } {
  if (openLeads(run).length > 0 || run.status !== 'active') return { run, message: null };
  const lead = newLead(run.leads, rng, false, config.newLeadFragments);
  return { run: { ...run, leads: [...run.leads, lead] }, message: `The archive yields a new partial address: lead ${lead.id}.` };
}

/** Close the ring without going through (back to base). */
export function standDown(run: RunState, config: RunConfig = RUN_CONFIG): RunResult {
  const ex = run.excursion;
  if (!ex || ex.expedition) return fail({ kind: 'busy' });
  const rng = Rng.fromState(run.rngState);
  let next = note({ ...run, excursion: null }, `You let the ring to ${isIdentified(run, ex.leadId) ? ex.world.name : 'the unidentified world'} close.`);
  const topped = ensureOpenLead(next, rng, config);
  next = { ...topped.run, rngState: rng.getState() };
  if (topped.message) next = note(next, topped.message);
  return { ok: true, run: settle(next, config) };
}

export function launch(run: RunState, config: RunConfig = RUN_CONFIG): RunResult {
  const ex = run.excursion;
  if (run.status !== 'active' || !ex || ex.expedition) return fail({ kind: 'busy' });
  const team = livingTeam(run);
  if (team.length === 0) return fail({ kind: 'no-team' });
  const expedition = startExpedition(ex.world, team, run.power, config.expedition);
  // Stepping through names the world for good.
  return { ok: true, run: identify({ ...run, excursion: { ...ex, expedition } }, ex.leadId) };
}

/** Store expedition progress (the run's power is the expedition's power). */
export function syncExpedition(run: RunState, expedition: ExpeditionState): RunState {
  if (!run.excursion) return run;
  return { ...run, power: expedition.power, excursion: { ...run.excursion, expedition } };
}

/** Where a recovered fragment ends up. Exported for tests. */
export function placeFragment(run: RunState, strength: 'major' | 'minor', hazard: number, rng: Rng, config: RunConfig = RUN_CONFIG): { run: RunState; message: string } {
  const knownSlotsOf = (l: Lead) => new Set(deriveKnowledge(l).slotGlyph.flatMap((g, i) => (g ? [i] : [])));
  const addTo = (r: RunState, lead: Lead): { run: RunState; ok: boolean } => {
    const fact = extraFact(rng, lead.address, lead.facts, strength, knownSlotsOf(lead));
    if (!fact) return { run: r, ok: false };
    return { run: { ...r, leads: r.leads.map((l) => (l.id === lead.id ? { ...l, facts: [...l.facts, fact] } : l)) }, ok: true };
  };

  const fin = finalLead(run);
  if (fin && !fin.solved && hazard >= config.finalFragment.minHazard && rng.chance(config.finalFragment.chance)) {
    const r = addTo(run, fin);
    if (r.ok) return { run: r.run, message: 'A fragment of the final address.' };
  }
  const open = openLeads(run);
  const makeNew = open.length === 0 || (open.length < config.maxOpenLeads && rng.chance(config.newLeadChance));
  if (!makeNew) {
    const target = rng.pick(open);
    const r = addTo(run, target);
    if (r.ok) return { run: r.run, message: `A new clue for lead ${target.id}.` };
  }
  if (open.length < config.maxOpenLeads) {
    const lead = newLead(run.leads, rng, false, strength === 'major' ? { knownSlots: 1, clues: 1 } : config.newLeadFragments);
    return { run: { ...run, leads: [...run.leads, lead] }, message: `A new partial address: lead ${lead.id}.` };
  }
  return { run, message: 'A fragment, but it adds nothing new.' };
}

/**
 * Bring an ended expedition home (or record its loss) and apply everything
 * it brought back.
 */
export function finishExcursion(run: RunState, config: RunConfig = RUN_CONFIG): RunResult {
  const ex = run.excursion;
  const exp = ex?.expedition;
  if (!ex || !exp || !ENDED.has(exp.status)) return fail({ kind: 'not-ended' });
  const rng = Rng.fromState(run.rngState);
  const lost = exp.status === 'stranded' || exp.status === 'wiped';
  const returnedIds = new Set(exp.team.map((m) => m.id));
  let next: RunState = { ...run, excursion: null, power: exp.power + config.returnTrickle };

  // Team: the living rest one wound step; the dead (and the stranded) are fallen.
  const fallenNow = lost ? exp.team : exp.team.filter((m) => !isAlive(m));
  const survivors = lost ? [] : exp.team.filter(isAlive).map((m) => changeWounds(m, -config.restHeal));
  const stayedHome = run.team.filter((m) => !returnedIds.has(m.id) && isAlive(m));
  next.team = [...survivors, ...stayedHome];
  next.fallen = [...run.fallen, ...fallenNow.map((m) => ({ ...m, wounds: 3 as const }))];
  next.stats = { ...run.stats, expeditions: run.stats.expeditions + 1, deaths: run.stats.deaths + fallenNow.length };
  const kw = next.worlds.map((w) => (w.leadId === ex.leadId ? { ...w, visits: w.visits + 1 } : w));
  next.worlds = kw;

  const lines: string[] = [];
  if (lost) {
    lines.push(exp.status === 'stranded' ? `The team on ${ex.world.name} could not dial home. They are lost.` : `The whole team was lost on ${ex.world.name}.`);
  } else {
    lines.push(exp.status === 'evacuated' ? `Emergency dial-out from ${ex.world.name}.` : `The team is home from ${ex.world.name}.`);
    for (const m of fallenNow) lines.push(`${m.name} did not come back.`);
    next.salvage += exp.haul.salvage;
    next.items = { ...next.items };
    for (const k of Object.keys(exp.haul.items) as AidKind[]) next.items[k] += exp.haul.items[k];
    for (const strength of exp.haul.fragments) {
      const placed = placeFragment(next, strength, ex.world.hazard, rng, config);
      next = placed.run;
      lines.push(placed.message);
    }
    next.stats = { ...next.stats, fragments: next.stats.fragments + exp.haul.fragments.length };
    if (ex.world.biome === 'final' && exp.status === 'returned') {
      next = { ...next, status: 'won' };
      lines.push('The team walks out of the ring, home from the Farpoint. The network is yours.');
    }
  }

  // Reinforcements sometimes arrive.
  if (next.recruits.length < config.recruitPoolMax && rng.chance(config.recruitChance)) {
    const r = newRecruit(next, rng);
    next.recruits = [...next.recruits, r];
    lines.push(`A new volunteer, ${r.name}, arrives at the base.`);
  }
  // Always leave something to decode.
  const topped = ensureOpenLead(next, rng, config);
  if (topped.message) lines.push(topped.message);
  next = topped.run;
  next.rngState = rng.getState();
  for (const l of lines.reverse()) next = note(next, l);
  return { ok: true, run: settle(next, config) };
}

/** Members on the current expedition, or the base team. */
export function visibleTeam(run: RunState): Member[] {
  return run.excursion?.expedition?.team ?? run.team;
}
