/**
 * Expedition prototype: a ring-centred expedition to try before rebuilding
 * the real one. One world at a time, built by the real generator.
 *
 * - The ring stays open for a fixed window of hours; every action costs time.
 * - Builder ruins hold glyph locks: a small deduction puzzle with the same
 *   feedback as dialling. Solving one yields address fragments.
 * - The world's faction acts according to your standing, which carries over
 *   from world to world.
 * - A hostile faction sends a patrol. When it arrives, or the window closes,
 *   the team runs for the ring and you key in the home address against the
 *   clock. The further from the ring, the less time you have.
 *
 * Deliberately self-contained (state and rules live here) so it can be
 * thrown away or folded into src/game once the design settles.
 */

import '../ui/styles.css';
import './proto.css';
import { BIOME_INFO } from '../data/biomes';
import { BIOME_PARTS, RUIN_STATES } from '../data/setting';
import { type Mark, generateAddress, scoreGuess } from '../game/address';
import { FAMILIES, type GlyphId, familyOf, glyphName } from '../game/glyphs';
import { Rng, deriveSeed } from '../game/rng';
import { type Faction, type Setting, capitalize, clampStanding, factionName, generateSetting, standingLabel } from '../game/setting';
import { type Member, generateTeam, isAlive } from '../game/team';
import { HAZARD_LABEL, type WorldProfile, describeWorld, generateWorldProfile, hazardCauses, ruinName, worldHazard } from '../game/world';
import { isSoundOn, setSoundOn } from '../ui/dialPlayer';
import { h } from '../ui/dom';
import { FAMILY_COLOR } from '../ui/families';
import { glyphSvg } from '../ui/glyphArt';
import { sharedRing } from '../ui/ringStage';
import type { ChevronLight } from '../ui/ringTimeline';
import { idleFrame } from '../ui/ringView';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const WINDOW_HOURS = 10;
const LOCK_LENGTH = 4;
const LOCK_TRIES = 6;
/** Emergency key-in: seconds at the ring, minus this much per hour of distance. */
const KEYIN_BASE_S = 16;
const KEYIN_PER_DISTANCE_S = 3;
const KEYIN_MIN_S = 7;
const KEYIN_MISTAKE_S = 1.5;
/** A hostile faction's patrol reaches the ring somewhere in this range of hours. */
const PATROL_EARLIEST = 6;
const PATROL_LATEST = 9;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type SiteKind = 'ruin' | 'camp' | 'landmark' | 'marker';

interface Site {
  id: string;
  kind: SiteKind;
  title: string;
  blurb: string;
  /** Hours from the ring. */
  distance: number;
}

interface Lock {
  code: GlyphId[];
  pool: GlyphId[];
  tries: { guess: GlyphId[]; marks: Mark[] }[];
  draft: (GlyphId | null)[];
  /** Slots told to you by a friendly faction. */
  hints: Map<number, GlyphId>;
  state: 'open' | 'solved' | 'sealed';
}

interface KeyIn {
  emergency: boolean;
  reason: string;
  entered: number;
  /** ms timestamp the clock runs out (emergency only). */
  deadline: number | null;
  totalMs: number;
  dialing: boolean;
}

interface Expedition {
  index: number;
  rng: Rng;
  profile: WorldProfile;
  hazard: number;
  faction: Faction | null;
  home: GlyphId[];
  hour: number;
  /** null: no patrol on this world. */
  patrolAt: number | null;
  patrolKnown: boolean;
  location: string; // 'ring' or a site id
  travelExtra: number;
  team: Member[];
  salvage: number;
  fragments: number;
  sites: Site[];
  done: Set<string>;
  lock: Lock | null;
  keyin: KeyIn | null;
  log: string[];
  mode: 'map' | 'lock' | 'keyin' | 'end';
  outcome: string | null;
  standingBefore: number | null;
}

interface Session {
  setting: Setting;
  worlds: number;
  fragments: number;
  salvage: number;
  lost: string[];
  team: Member[];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const sessionSeed = `proto-${Date.now().toString(36)}`;
const session: Session = {
  setting: generateSetting(new Rng(deriveSeed(sessionSeed, 'setting'))),
  worlds: 0,
  fragments: 0,
  salvage: 0,
  lost: [],
  team: generateTeam(new Rng(deriveSeed(sessionSeed, 'team'))),
};
const HOME: GlyphId[] = generateAddress(new Rng(deriveSeed(sessionSeed, 'home')), 6);

function factionOn(profile: WorldProfile): Faction | null {
  const id = profile.parts?.faction?.id;
  return id ? (session.setting.factions.find((f) => f.id === id) ?? null) : null;
}

function newExpedition(index: number): Expedition {
  // The first world always shows off a lock and a faction; later ones are as they come.
  let profile!: WorldProfile;
  for (let i = 0; i < 60; i++) {
    profile = generateWorldProfile(`${sessionSeed}-w${index}-${i}`, session.setting, { hazard: index === 0 ? 4 : undefined });
    const p = profile.parts!;
    const lockable = p.ruin && ['sealed', 'guarded', 'unstable'].includes(p.ruin.state);
    const hostile = factionOn(profile)?.standing ?? 0;
    if (index > 0 || (lockable && hostile <= -2)) break;
  }
  const rng = new Rng(deriveSeed(profile.seed, 'proto'));
  const parts = profile.parts!;
  const bp = BIOME_PARTS[profile.biome as keyof typeof BIOME_PARTS];
  const faction = factionOn(profile);
  const cond = bp.conditions.find((c) => c.id === parts.condition)!;
  const sites: Site[] = [];
  const landmark = bp.landmarks.find((l) => l.id === parts.landmark)!;
  sites.push({ id: 'landmark', kind: 'landmark', title: 'Search the surroundings', blurb: landmark.text, distance: 1 });
  if (parts.ruin) {
    const st = RUIN_STATES.find((s) => s.id === parts.ruin!.state)!;
    sites.push({ id: 'ruin', kind: 'ruin', title: capitalize(ruinName(parts.ruin, session.setting)), blurb: `${capitalize(parts.ruin.place)}. It ${st.text}.`, distance: 2 });
  }
  if (faction && parts.faction) {
    sites.push({ id: 'camp', kind: 'camp', title: `${capitalize(factionName(faction))} camp`, blurb: `${capitalize(parts.faction.place)}. They are ${standingLabel(faction.standing).toLowerCase()} towards you.`, distance: faction.standing <= -2 ? 2 : 1 });
  }
  if (sites.length < 3) sites.push({ id: 'marker', kind: 'marker', title: 'A carved marker stone', blurb: 'A standing stone cut with rows of glyphs, half worn away.', distance: 2 });
  const hostile = faction && faction.standing <= -2;
  const team = session.team.filter(isAlive);
  return {
    index,
    rng,
    profile,
    hazard: worldHazard(profile, session.setting),
    faction,
    home: HOME,
    hour: 0,
    patrolAt: hostile ? rng.int(PATROL_EARLIEST, PATROL_LATEST) : null,
    patrolKnown: false,
    location: 'ring',
    travelExtra: cond.danger >= 2 ? 1 : 0,
    team,
    salvage: 0,
    fragments: 0,
    sites,
    done: new Set(),
    lock: null,
    keyin: null,
    log: [`The team steps through onto ${profile.name}. The ring will hold for ${WINDOW_HOURS} hours.`],
    mode: 'map',
    outcome: null,
    standingBefore: faction ? faction.standing : null,
  };
}

let ex = newExpedition(0);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function siteById(id: string): Site | undefined {
  return ex.sites.find((s) => s.id === id);
}

function distanceToRing(): number {
  return ex.location === 'ring' ? 0 : (siteById(ex.location)?.distance ?? 0);
}

function travelCost(to: string): number {
  if (to === ex.location) return 0;
  const base = to === 'ring' ? distanceToRing() : ex.location === 'ring' ? siteById(to)!.distance : 1;
  return base + ex.travelExtra;
}

function note(text: string) {
  ex.log.unshift(text);
}

function living(): Member[] {
  return ex.team.filter(isAlive);
}

function wound(text: string, steps = 1) {
  const team = living();
  if (team.length === 0) return;
  const m = ex.rng.pick(team);
  m.wounds = Math.min(3, m.wounds + steps) as Member['wounds'];
  note(text.replace('{name}', m.name.split(' ')[0]!) + (m.wounds >= 3 ? ` ${m.name} is dead.` : ''));
  if (living().length === 0) end('wiped');
}

/** Spend hours, then check the patrol and the window. Returns false if an emergency began. */
function spend(hours: number): boolean {
  ex.hour += hours;
  if (ex.mode === 'end') return false;
  if (ex.patrolAt !== null && ex.hour >= ex.patrolAt) {
    startKeyIn(true, `A patrol of ${factionName(ex.faction!)} is coming for the ring. Run!`);
    return false;
  }
  if (ex.hour >= WINDOW_HOURS) {
    startKeyIn(true, 'The ring is failing. Run for it and dial home!');
    return false;
  }
  return true;
}

function goTo(id: string) {
  const cost = travelCost(id);
  ex.location = id;
  if (cost > 0) note(`${id === 'ring' ? 'Back to the ring' : siteById(id)!.kind === 'landmark' ? 'Out into the surroundings' : `To the ${siteById(id)!.title.replace(/^The /, '')}`}: ${cost} hour${cost === 1 ? '' : 's'}.`);
  if (!spend(cost)) return;
  if (id === 'ring') startKeyIn(false, 'Key in the home address to open the ring.');
}

function shiftStanding(by: number) {
  const f = ex.faction!;
  const before = f.standing;
  f.standing = clampStanding(f.standing + by);
  if (f.standing !== before) note(`${capitalize(factionName(f))}: ${standingLabel(before)} → ${standingLabel(f.standing)}.`);
  if (f.standing > -2 && ex.patrolAt !== null && before <= -2) {
    ex.patrolAt = null;
    note('They call off their patrol.');
  }
}

// Sites -------------------------------------------------------------------

interface Action {
  label: string;
  hours: number;
  detail?: string;
  disabled?: string;
  run: () => void;
}

function siteActions(site: Site): Action[] {
  const p = ex.profile.parts!;
  const bp = BIOME_PARTS[ex.profile.biome as keyof typeof BIOME_PARTS];
  const wild = bp.wildlife.find((w) => w.id === p.wildlife)!;
  switch (site.kind) {
    case 'landmark':
      return [
        {
          label: 'Search for salvage',
          hours: 1,
          detail: wild.danger > 0 ? `Risky: ${wild.label}.` : undefined,
          disabled: ex.done.has('landmark') ? 'Already searched' : undefined,
          run: () => {
            ex.done.add('landmark');
            if (!spend(1)) return;
            const got = ex.rng.int(3, 7);
            ex.salvage += got;
            note(`You pick over the area: ${got} salvage.`);
            if (wild.danger > 0 && ex.rng.chance(0.35)) wound(`The ${wild.label} find you. {name} is hurt getting clear.`);
          },
        },
      ];
    case 'marker':
      return [
        {
          label: 'Copy the carvings',
          hours: 1,
          disabled: ex.done.has('marker') ? 'Already copied' : undefined,
          run: () => {
            ex.done.add('marker');
            if (!spend(1)) return;
            if (ex.rng.chance(0.4)) {
              ex.fragments++;
              note('One row of the carvings is part of a ring address. An address fragment.');
            } else note('The carvings are too worn to read.');
          },
        },
      ];
    case 'ruin': {
      const state = p.ruin!.state;
      const claimed = ex.faction && ex.faction.standing <= -2;
      if (state === 'open' || state === 'picked') {
        return [
          {
            label: 'Search the ruin',
            hours: 2,
            disabled: ex.done.has('ruin') ? 'Already searched' : undefined,
            run: () => {
              ex.done.add('ruin');
              if (!spend(2)) return;
              const got = state === 'open' ? ex.rng.int(5, 9) : ex.rng.int(1, 3);
              ex.salvage += got;
              note(`You search the ruin: ${got} salvage.`);
              if (state === 'open' && ex.rng.chance(0.5)) {
                ex.fragments++;
                note('An address carved over a doorway. An address fragment.');
              }
            },
          },
        ];
      }
      const risk = state === 'guarded' ? 'Its machines strike at wrong answers.' : state === 'unstable' ? 'The structure may give way while you work.' : undefined;
      return [
        {
          label: ex.lock?.state === 'solved' ? 'The lock is open' : ex.lock?.state === 'sealed' ? 'The lock has sealed itself' : 'Work the glyph lock',
          hours: 0,
          detail: [`Each attempt takes an hour.`, risk, claimed ? `Soldiers of ${factionName(ex.faction!)} are close; working here will be noticed.` : undefined].filter(Boolean).join(' '),
          disabled: ex.lock && ex.lock.state !== 'open' ? 'Done' : undefined,
          run: () => {
            if (!ex.lock) {
              ex.lock = makeLock();
              if (claimed && ex.patrolAt !== null) {
                ex.patrolAt = Math.max(ex.hour + 2, ex.patrolAt - 1);
                note('You have been seen. The patrol will come an hour sooner.');
              }
            }
            ex.mode = 'lock';
          },
        },
      ];
    }
    case 'camp': {
      const f = ex.faction!;
      const elders = f.archetype === 'elders' || f.archetype === 'remnant';
      const lockOpen = ex.lock?.state === 'open' || (!ex.lock && ex.sites.some((s) => s.kind === 'ruin') && ['sealed', 'guarded', 'unstable'].includes(ex.profile.parts!.ruin!.state));
      if (f.standing <= -2) {
        return [
          {
            label: 'Watch the garrison',
            hours: 1,
            detail: 'Learn when their patrol will come.',
            disabled: ex.patrolKnown ? 'You know when they will come' : undefined,
            run: () => {
              if (!spend(1)) return;
              ex.patrolKnown = true;
              note(`You watch their shift change. The patrol will reach the ring in hour ${ex.patrolAt}.`);
            },
          },
          {
            label: 'Raid their stores',
            hours: 1,
            detail: 'Half a chance of a big haul. Either way they will want you gone, sooner.',
            disabled: ex.done.has('raid') ? 'Already raided' : undefined,
            run: () => {
              ex.done.add('raid');
              if (!spend(1)) return;
              if (ex.rng.chance(0.5)) {
                const got = ex.rng.int(10, 16);
                ex.salvage += got;
                note(`You get in and out with ${got} salvage.`);
                if (ex.patrolAt !== null) ex.patrolAt = Math.min(ex.patrolAt, ex.hour + 2);
              } else {
                wound('The raid goes wrong. {name} is shot getting out.');
                if (ex.patrolAt !== null) ex.patrolAt = ex.hour + 1;
              }
              shiftStanding(-1);
            },
          },
        ];
      }
      if (f.standing === -1) {
        return [
          {
            label: 'Approach openly',
            hours: 1,
            detail: 'They might talk. They might not.',
            run: () => {
              if (!spend(1)) return;
              if (ex.rng.chance(0.55)) {
                note('They lower their weapons and listen.');
                shiftStanding(1);
              } else note('They warn you off. Nobody shoots, this time.');
            },
          },
        ];
      }
      return [
        {
          label: `Ask about the ${p.ruin ? ruinName(p.ruin, session.setting) : 'ruins'}`,
          hours: 1,
          detail: elders ? 'They know the old locks well: two glyphs.' : 'They may know part of the lock: one glyph.',
          disabled: !lockOpen ? 'There is no lock to ask about' : ex.done.has('ask') ? 'Already asked' : undefined,
          run: () => {
            ex.done.add('ask');
            if (!spend(1)) return;
            ex.lock ??= makeLock();
            const free = ex.lock.code.map((g, i) => [i, g] as const).filter(([i]) => !ex.lock!.hints.has(i));
            for (const [i, g] of ex.rng.shuffle(free).slice(0, elders ? 2 : 1)) ex.lock.hints.set(i, g);
            note(`They tell you part of the lock: ${[...ex.lock.hints].map(([i, g]) => `${glyphName(g)} in place ${i + 1}`).join(', ')}.`);
          },
        },
        {
          label: 'Trade for an address',
          hours: 1,
          detail: 'Costs 8 salvage.',
          disabled: ex.salvage < 8 ? 'Not enough salvage' : ex.done.has('trade') ? 'Already traded' : undefined,
          run: () => {
            ex.done.add('trade');
            if (!spend(1)) return;
            ex.salvage -= 8;
            ex.fragments++;
            note('They sell you part of an address they found. An address fragment.');
          },
        },
        {
          label: 'Help them',
          hours: 2,
          detail: f.standing >= 3 ? 'You are already allies.' : 'Improves your standing with them, here and on every world.',
          disabled: f.standing >= 3 ? 'Allied' : ex.done.has('help') ? 'Already helped' : undefined,
          run: () => {
            ex.done.add('help');
            if (!spend(2)) return;
            note('You spend two hours hauling water and mending a generator.');
            shiftStanding(1);
          },
        },
      ];
    }
  }
}

// Glyph lock ---------------------------------------------------------------

function makeLock(): Lock {
  const fams = ex.rng.sample(FAMILIES, 2);
  const pool = fams.flatMap((f) => f.glyphs as readonly GlyphId[]);
  const code = ex.rng.sample(pool, LOCK_LENGTH);
  return { code, pool, tries: [], draft: Array(LOCK_LENGTH).fill(null), hints: new Map(), state: 'open' };
}

function lockTry() {
  const lock = ex.lock!;
  if (lock.draft.some((g) => g === null)) return;
  const guess = lock.draft as GlyphId[];
  const marks = scoreGuess(lock.code, guess);
  lock.tries.push({ guess, marks });
  lock.draft = Array(LOCK_LENGTH).fill(null);
  const solved = marks.every((m) => m === 'locked');
  const state = ex.profile.parts!.ruin!.state;
  if (solved) {
    lock.state = 'solved';
    const frags = state === 'sealed' ? 2 : 1;
    const got = ex.rng.int(6, 12);
    ex.fragments += frags;
    ex.salvage += got;
    note(`The lock turns. Inside: ${got} salvage and ${frags === 2 ? 'two address fragments' : 'an address fragment'}.`);
    tone(660, 0.18);
    setTimeout(() => tone(990, 0.3), 140);
    ex.mode = 'map';
  } else {
    tone(180, 0.15, 'square');
    if (state === 'guarded' && ex.rng.chance(0.35)) wound('A guardian machine lashes out. {name} takes the blow.');
    if (state === 'unstable' && ex.rng.chance(0.2)) wound('Part of the ceiling comes down. {name} is caught under it.');
    if (lock.tries.length >= LOCK_TRIES && lock.state === 'open') {
      lock.state = 'sealed';
      note('The lock grinds shut for good.');
      ex.mode = 'map';
    }
  }
  if (ex.mode !== 'end') spend(1);
  render();
}

// Key-in -------------------------------------------------------------------

let clockRaf = 0;

function startKeyIn(emergency: boolean, reason: string) {
  const dist = distanceToRing();
  const totalMs = Math.max(KEYIN_MIN_S, KEYIN_BASE_S - KEYIN_PER_DISTANCE_S * dist) * 1000;
  ex.location = 'ring';
  ex.mode = 'keyin';
  ex.keyin = { emergency, reason, entered: 0, deadline: emergency ? performance.now() + totalMs : null, totalMs, dialing: false };
  if (emergency) {
    note(reason);
    if (dist > 0) note(`You are ${dist} hour${dist === 1 ? '' : 's'} from the ring: ${Math.round(totalMs / 1000)} seconds to dial.`);
    alarm();
  }
  renderRingKeyed(0);
  cancelAnimationFrame(clockRaf);
  if (emergency) clockRaf = requestAnimationFrame(clockTick);
}

function clockTick() {
  const k = ex.keyin;
  if (!k || k.deadline === null || k.dialing || ex.mode !== 'keyin') return;
  const left = k.deadline - performance.now();
  const bar = document.querySelector<HTMLElement>('.keyin-clock-fill');
  const label = document.querySelector<HTMLElement>('.keyin-clock-num');
  if (bar) bar.style.width = `${Math.max(0, (left / k.totalMs) * 100)}%`;
  if (label) label.textContent = `${Math.max(0, left / 1000).toFixed(1)} s`;
  if (left <= 0) {
    caught();
    return;
  }
  clockRaf = requestAnimationFrame(clockTick);
}

function keyGlyph(g: GlyphId, btn: HTMLElement) {
  const k = ex.keyin!;
  if (k.dialing) return;
  if (g === ex.home[k.entered]) {
    k.entered++;
    tone(320 + k.entered * 70, 0.09);
    renderRingKeyed(k.entered);
    if (k.entered === ex.home.length) {
      void dialOut();
      return;
    }
    renderKeyInProgress();
  } else {
    tone(110, 0.2, 'square');
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    if (k.deadline !== null) k.deadline -= KEYIN_MISTAKE_S * 1000;
  }
}

async function dialOut() {
  const k = ex.keyin!;
  k.dialing = true;
  cancelAnimationFrame(clockRaf);
  render();
  const { player } = sharedRing(6);
  await player.play(ex.home, ex.home.map(() => 'locked'));
  end(k.emergency ? 'escaped' : 'home');
}

function caught() {
  cancelAnimationFrame(clockRaf);
  const team = living();
  const left = team.length > 1 ? ex.rng.pick(team) : null;
  if (left) {
    left.wounds = 3;
    note(`${left.name} holds them off while the others get the ring open. ${left.name.split(' ')[0]} does not make it through.`);
  }
  const lostSalvage = Math.ceil(ex.salvage / 2);
  ex.salvage -= lostSalvage;
  if (lostSalvage) note(`${lostSalvage} salvage is left behind.`);
  end(left ? 'caught' : 'wiped');
}

function end(outcome: string) {
  if (ex.mode === 'end') return;
  ex.mode = 'end';
  ex.outcome = outcome;
  cancelAnimationFrame(clockRaf);
  if (outcome !== 'wiped') {
    session.fragments += ex.fragments;
    session.salvage += ex.salvage;
  }
  session.worlds++;
  for (const m of ex.team) if (!isAlive(m) && !session.lost.includes(m.name)) session.lost.push(m.name);
  // Survivors rest between worlds.
  for (const m of session.team) if (isAlive(m)) m.wounds = Math.max(0, m.wounds - 1) as Member['wounds'];
  render();
}

// ---------------------------------------------------------------------------
// Sound (small cues; the dial itself uses the game's ring sound)
// ---------------------------------------------------------------------------

let audio: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType = 'sine') {
  if (!isSoundOn()) return;
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(type === 'square' ? 0.05 : 0.12, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur + 0.02);
  } catch {
    /* no audio */
  }
}
function alarm() {
  for (let i = 0; i < 3; i++) setTimeout(() => tone(i % 2 ? 520 : 440, 0.22, 'sawtooth'), i * 240);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!;
const { view: ring } = sharedRing(6);

function renderRingKeyed(entered: number) {
  const frame = idleFrame(6, 0);
  frame.chevrons = ex.home.map((g, i) => ({ light: (i < entered ? 'locked' : i === entered ? 'armed' : 'dark') as ChevronLight, glow: i < entered ? 0.6 : 0, glyph: i < entered ? g : null }));
  frame.rim = entered / ex.home.length;
  ring.render(frame, performance.now());
}

function glyphChip(g: GlyphId, cls = ''): HTMLElement {
  return h('span', { class: `chip ${cls}`, style: `--fam:${FAMILY_COLOR[familyOf(g)]}`, title: glyphName(g) }, glyphSvg(g));
}

function timeline(): HTMLElement {
  const pct = (hr: number) => `${Math.min(100, (hr / WINDOW_HOURS) * 100)}%`;
  const marks: HTMLElement[] = [];
  for (let i = 0; i <= WINDOW_HOURS; i++) marks.push(h('span', { class: 'tick', style: `left:${pct(i)}` }));
  const patrol =
    ex.patrolAt === null
      ? null
      : ex.patrolKnown
        ? h('span', { class: 'patrol', style: `left:${pct(ex.patrolAt)}`, title: `Patrol arrives in hour ${ex.patrolAt}` }, 'Patrol')
        : h('span', { class: 'patrol unknown', style: `left:${pct(PATROL_EARLIEST)};width:${pct(PATROL_LATEST - PATROL_EARLIEST)}`, title: `A patrol will come, some time between hours ${PATROL_EARLIEST} and ${PATROL_LATEST}` }, 'Patrol?');
  return h(
    'div',
    { class: 'timeline' },
    h('div', { class: 'timeline-head' }, h('strong', {}, `Hour ${ex.hour} of ${WINDOW_HOURS}`), h('span', { class: 'muted small-text' }, ex.patrolAt === null ? 'No patrol on this world' : ex.patrolKnown ? `Patrol in hour ${ex.patrolAt}` : `A patrol is coming (hours ${PATROL_EARLIEST}-${PATROL_LATEST})`)),
    h('div', { class: 'track' }, marks, h('div', { class: 'elapsed', style: `width:${pct(ex.hour)}` }), patrol, h('span', { class: 'close', style: `left:100%` }, 'Ring closes')),
  );
}

function teamList(): HTMLElement {
  const label = ['Healthy', 'Wounded', 'Critical', 'Dead'];
  return h(
    'div',
    { class: 'proto-team' },
    ex.team.map((m) => h('div', { class: `pm w${m.wounds}` }, h('span', {}, m.name), h('span', { class: 'small-text' }, label[m.wounds]))),
  );
}

function worldCard(): HTMLElement {
  const causes = hazardCauses(ex.profile, session.setting).map((c) => c.label);
  return h(
    'section',
    { class: 'panel world-card' },
    h('h2', {}, `World ${ex.index + 1}`),
    h('div', { class: 'world-name' }, ex.profile.name),
    h('div', { class: 'world-meta' }, h('strong', {}, BIOME_INFO[ex.profile.biome].name), ` · Hazard ${ex.hazard} (${HAZARD_LABEL[ex.hazard]})`),
    h('p', { class: 'muted' }, describeWorld(ex.profile, session.setting).join(' ')),
    causes.length ? h('p', { class: 'small-text' }, h('strong', {}, 'Dangers: '), causes.join(', '), '.') : null,
    ex.travelExtra ? h('p', { class: 'small-text warn-text' }, 'Bad weather: every journey takes an hour longer.') : null,
  );
}

function siteCards(): HTMLElement {
  const here = ex.location;
  return h(
    'section',
    { class: 'panel sites' },
    h('h2', {}, 'Where to?'),
    h(
      'div',
      { class: 'site-list' },
      ex.sites.map((s) => {
        const at = here === s.id;
        const cost = travelCost(s.id);
        return h(
          'div',
          { class: `site ${at ? 'here' : ''}` },
          h('div', { class: 'site-head' }, h('strong', {}, s.title), h('span', { class: 'muted small-text' }, at ? 'You are here' : `${cost} h away`)),
          h('p', { class: 'muted small-text' }, s.blurb),
          at
            ? h(
                'div',
                { class: 'actions' },
                siteActions(s).map((a) =>
                  h(
                    'div',
                    { class: 'action' },
                    h('button', { class: 'small', disabled: !!a.disabled, title: a.disabled ?? '', onclick: () => act(a.run) }, a.hours ? `${a.label} (${a.hours} h)` : a.label),
                    a.disabled ? h('span', { class: 'muted small-text' }, a.disabled) : a.detail ? h('span', { class: 'muted small-text' }, a.detail) : null,
                  ),
                ),
              )
            : h('button', { class: 'small', onclick: () => act(() => goTo(s.id)) }, `Go (${cost} h)`),
        );
      }),
      h(
        'div',
        { class: 'site ring-site' },
        h('div', { class: 'site-head' }, h('strong', {}, 'The ring'), h('span', { class: 'muted small-text' }, here === 'ring' ? 'You are here' : `${travelCost('ring')} h away`)),
        h('p', { class: 'muted small-text' }, 'Go home with what you have. You key in the home address yourself.'),
        h('button', { class: 'small primary', onclick: () => act(() => goTo('ring')) }, here === 'ring' ? 'Dial home' : `Return and dial home (${travelCost('ring')} h)`),
      ),
    ),
  );
}

function lockPanel(): HTMLElement {
  const lock = ex.lock!;
  const left = LOCK_TRIES - lock.tries.length;
  const cursor = lock.draft.indexOf(null);
  const row = (glyphs: (GlyphId | null)[], marks?: Mark[]) =>
    h(
      'div',
      { class: 'lock-row' },
      glyphs.map((g, i) =>
        h(
          'button',
          {
            class: `lock-slot ${marks ? `mark-${marks[i]}` : ''} ${!marks && i === cursor ? 'cursor' : ''} ${!marks && lock.hints.get(i) === g && g ? 'hinted' : ''}`,
            disabled: !!marks,
            onclick: () => {
              if (marks) return;
              lock.draft[i] = null;
              render();
            },
          },
          g ? glyphSvg(g) : h('span', { class: 'muted' }, String(i + 1)),
        ),
      ),
    );
  return h(
    'section',
    { class: 'panel lock' },
    h('h2', {}, 'Glyph lock'),
    h('p', { class: 'muted' }, `Four glyphs, all different, from these ${lock.pool.length}. Same rules as the ring: green is right, amber is in the lock but elsewhere, grey is not in it. ${left} attempt${left === 1 ? '' : 's'} left before it seals.`),
    lock.hints.size ? h('p', { class: 'small-text' }, h('strong', {}, 'You were told: '), [...lock.hints].map(([i, g]) => `${glyphName(g)} in place ${i + 1}`).join(', '), '.') : null,
    h('div', { class: 'lock-history' }, lock.tries.map((t) => row(t.guess, t.marks))),
    row(lock.draft),
    h(
      'div',
      { class: 'lock-pool' },
      lock.pool.map((g) => {
        const used = lock.draft.includes(g);
        const absent = lock.tries.some((t) => t.guess.some((x, i) => x === g && t.marks[i] === 'absent'));
        return h(
          'button',
          {
            class: `glyph-btn ${absent ? 'status-absent' : ''} ${used ? 'in-draft' : ''}`,
            style: `--fam:${FAMILY_COLOR[familyOf(g)]}`,
            onclick: () => {
              const at = lock.draft.indexOf(null);
              if (at === -1 || used) return;
              lock.draft[at] = g;
              render();
            },
          },
          glyphSvg(g),
          h('span', { class: 'glyph-name' }, glyphName(g)),
        );
      }),
    ),
    h(
      'div',
      { class: 'controls' },
      h('button', { class: 'primary', disabled: lock.draft.includes(null), onclick: () => act(lockTry) }, 'Try it (1 h)'),
      h('button', { onclick: () => act(() => (ex.mode = 'map')) }, 'Step back'),
    ),
  );
}

function renderKeyInProgress() {
  const k = ex.keyin!;
  document.querySelectorAll<HTMLElement>('.home-strip .chip').forEach((el, i) => {
    el.classList.toggle('done', i < k.entered);
    el.classList.toggle('next', i === k.entered);
  });
}

function keyInPanel(): HTMLElement {
  const k = ex.keyin!;
  const palette = h(
    'div',
    { class: 'keypad' },
    FAMILIES.map((f) =>
      h(
        'div',
        { class: 'key-row', style: `--fam:${FAMILY_COLOR[f.id]}` },
        (f.glyphs as readonly GlyphId[]).map((g) => {
          const b = h('button', { class: 'key', title: glyphName(g), 'aria-label': glyphName(g), disabled: k.dialing }, glyphSvg(g));
          b.addEventListener('click', () => keyGlyph(g, b));
          return b;
        }),
      ),
    ),
  );
  return h(
    'section',
    { class: `panel keyin ${k.emergency ? 'emergency' : ''}` },
    h('h2', {}, k.emergency ? 'Emergency dial-out' : 'Dial home'),
    h('p', { class: k.emergency ? 'alarm-text' : 'muted' }, k.reason),
    k.emergency && !k.dialing
      ? h('div', { class: 'keyin-clock' }, h('div', { class: 'keyin-clock-fill' }), h('span', { class: 'keyin-clock-num' }, `${(k.totalMs / 1000).toFixed(1)} s`))
      : null,
    h('div', { class: 'home-strip' }, h('span', { class: 'muted small-text' }, 'Home:'), ex.home.map((g, i) => glyphChip(g, i < k.entered ? 'done' : i === k.entered ? 'next' : ''))),
    k.dialing ? h('p', { class: 'muted' }, 'The ring is turning...') : palette,
    k.emergency && !k.dialing ? h('p', { class: 'muted small-text' }, `Wrong glyphs cost ${KEYIN_MISTAKE_S} seconds.`) : null,
  );
}

const OUTCOME_TEXT: Record<string, string> = {
  home: 'The team walks home through the ring, in good order.',
  escaped: 'The ring opens just in time. The team dives through.',
  caught: 'The ring opens, but not everyone gets through.',
  wiped: 'Nobody comes back from this one.',
};

function endPanel(): HTMLElement {
  const standing =
    ex.faction && ex.standingBefore !== null && ex.standingBefore !== ex.faction.standing
      ? `${capitalize(factionName(ex.faction))}: ${standingLabel(ex.standingBefore)} → ${standingLabel(ex.faction.standing)}`
      : null;
  const alive = session.team.filter(isAlive).length;
  return h(
    'section',
    { class: 'panel end' },
    h('h2', {}, 'Back at base'),
    h('p', { class: 'end-title' }, OUTCOME_TEXT[ex.outcome ?? 'home']),
    h(
      'ul',
      {},
      h('li', {}, `Time used: ${Math.min(ex.hour, WINDOW_HOURS)} of ${WINDOW_HOURS} hours`),
      h('li', {}, `Address fragments: ${ex.outcome === 'wiped' ? 0 : ex.fragments}`),
      h('li', {}, `Salvage: ${ex.outcome === 'wiped' ? 0 : ex.salvage}`),
      standing ? h('li', {}, standing) : null,
    ),
    h('p', { class: 'muted small-text' }, `This session: ${session.worlds} world${session.worlds === 1 ? '' : 's'}, ${session.fragments} fragments, ${session.salvage} salvage${session.lost.length ? `, lost: ${session.lost.join(', ')}` : ''}.`),
    alive > 0
      ? h('button', { class: 'primary', onclick: () => act(nextWorld) }, 'Next world')
      : h('p', { class: 'warn-text' }, 'No one is left to send. Reload the page for a new session.'),
  );
}

function nextWorld() {
  ex = newExpedition(ex.index + 1);
  // Close the portal left open by the last dial.
  sharedRing(6).player.reset(6);
}

function networkPanel(): HTMLElement {
  const fs = session.setting.factions.filter((f) => f.tier === 'major' || f.id === ex.faction?.id);
  return h(
    'section',
    { class: 'panel network' },
    h('h2', {}, 'Relations'),
    h(
      'div',
      { class: 'factions' },
      fs.map((f) =>
        h(
          'div',
          { class: 'faction-head' },
          h('strong', {}, f.name),
          h('span', { class: `standing standing-${f.standing < 0 ? 'bad' : f.standing > 0 ? 'good' : 'neutral'}` }, standingLabel(f.standing)),
        ),
      ),
    ),
  );
}

function render() {
  const main =
    ex.mode === 'lock' ? lockPanel() : ex.mode === 'keyin' ? keyInPanel() : ex.mode === 'end' ? endPanel() : siteCards();
  root.replaceChildren(
    h(
      'header',
      { class: 'topbar' },
      h('h1', {}, 'Farpoint'),
      h('span', { class: 'muted' }, 'Expedition prototype'),
      h('button', { class: 'small', onclick: () => { setSoundOn(!isSoundOn()); render(); } }, isSoundOn() ? 'Sound on' : 'Sound off'),
    ),
    h(
      'main',
      { class: 'proto' },
      h('div', { class: 'proto-side' }, h('section', { class: 'panel ring-panel' }, ring.el, timeline(), teamList()), networkPanel()),
      h('div', { class: 'proto-main' }, worldCard(), main, h('section', { class: 'panel log' }, h('h2', {}, 'Log'), h('ol', { class: 'journal' }, ex.log.slice(0, 10).map((l) => h('li', {}, l))))),
    ),
  );
  if (ex.mode === 'keyin' && ex.keyin && !ex.keyin.dialing) {
    renderRingKeyed(ex.keyin.entered);
    cancelAnimationFrame(clockRaf);
    if (ex.keyin.deadline !== null) clockRaf = requestAnimationFrame(clockTick);
  }
}

function act(fn: () => void) {
  fn();
  render();
}

ring.render(idleFrame(6, 0), performance.now());
render();
