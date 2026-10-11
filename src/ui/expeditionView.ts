/**
 * Expedition screen (standalone test harness until the base screen exists):
 * world briefing with an optional probe, then the encounter chain.
 * All rules live in src/game/expedition.ts.
 */

import { BIOME_INFO } from '../data/biomes';
import { ENCOUNTERS } from '../data/encounters';
import type { AidKind } from '../game/decode';
import type { Choice } from '../game/encounter';
import {
  type AppliedEffect,
  type ExpeditionError,
  type ExpeditionState,
  type Resolution,
  ENDED,
  canAffordReturn,
  choiceBlocked,
  choose,
  currentEncounter,
  emergencyDialOut,
  medicTreat,
  returnHome,
  startExpedition,
  successChance,
} from '../game/expedition';
import { Rng, deriveSeed } from '../game/rng';
import { ROLE_LABEL, STATS, STAT_LABEL, WOUND_LABEL, effectiveStat, generateTeam, isAlive } from '../game/team';
import { HAZARD_LABEL, type ProbeReport, type World, generateWorld, probeWorld } from '../game/world';
import { h } from './dom';

const PROBE_COST = 5;
const START_POWER = 60;

const ITEM_LABEL: Record<AidKind, string> = { reveal: 'Resonance key', eliminate: 'Null filter', freeDial: 'Capacitor' };

export interface ExpeditionViewOptions {
  seedLabel: string;
  /** Starting power (test harness override). */
  startPower?: number;
  onNewWorld: () => void;
}

export function mountExpeditionView(root: HTMLElement, seed: string, opts: ExpeditionViewOptions): { dispose(): void } {
  const world: World = generateWorld(seed, ENCOUNTERS);
  const team = generateTeam(new Rng(deriveSeed(seed, 'team')));
  let power = opts.startPower ?? START_POWER;
  let probe: ProbeReport | null = null;
  let exp: ExpeditionState | null = null;
  let lastResolution: Resolution | null = null;
  let message = '';

  const nameOf = (id: string) => (exp?.team ?? team).find((m) => m.id === id)?.name ?? id;

  function act(fn: () => void) {
    message = '';
    fn();
    render();
  }

  function doProbe() {
    if (probe || power < PROBE_COST) return;
    power -= PROBE_COST;
    probe = probeWorld(world, ENCOUNTERS);
  }

  function launch() {
    exp = startExpedition(world, team, power);
  }

  function take(choice: Choice, actorId: string | null) {
    if (!exp) return;
    const r = choose(exp, ENCOUNTERS, choice.id, actorId);
    if (!r.ok) {
      message = errorText(r.error);
      return;
    }
    exp = r.state;
    lastResolution = r.value;
  }

  function render() {
    const header = h(
      'header',
      { class: 'topbar' },
      h('h1', {}, 'Farpoint'),
      h('span', { class: 'subtitle' }, 'Expedition'),
      h('span', { class: 'seed' }, `seed ${opts.seedLabel}`),
      h('a', { class: 'nav-link', href: `?screen=decode&seed=${encodeURIComponent(opts.seedLabel)}` }, 'Decode test'),
      powerMeter(exp?.power ?? power, START_POWER),
    );

    const story = h('div', { class: 'exp-main' });
    if (!exp) story.append(briefingPanel());
    else if (lastResolution && !ENDED.has(exp.status) && exp.status !== 'complete') story.append(resolutionPanel(lastResolution, true));
    else if (exp.status === 'encounter') story.append(encounterPanel());
    else story.append(...(lastResolution ? [resolutionPanel(lastResolution, false)] : []), endPanel());
    if (exp && exp.log.length) story.append(logPanel());
    root.replaceChildren(header, h('main', { class: 'expedition' }, h('div', { class: 'exp-side' }, worldPanel(), teamPanel()), story));
  }

  function worldPanel(): HTMLElement {
    const biome = BIOME_INFO[world.biome];
    const hazardKnown = probe !== null || exp !== null;
    return h(
      'section',
      { class: 'panel world-panel' },
      h('h2', {}, 'World'),
      h('div', { class: 'world-name' }, world.name),
      h('div', { class: 'world-meta' }, h('strong', {}, biome.name), ' · ', hazardKnown ? `Hazard ${world.hazard} (${HAZARD_LABEL[world.hazard]})` : 'Hazard unknown'),
      h('p', { class: 'muted' }, biome.description),
      exp ? h('div', { class: 'progress' }, progressText(exp)) : null,
    );
  }

  function teamPanel(): HTMLElement {
    const members = exp?.team ?? team;
    const medicReady = exp && !ENDED.has(exp.status) && !exp.medicUsed && members.some((m) => m.role === 'medic' && isAlive(m) && m.wounds < 2);
    return h(
      'section',
      { class: 'panel team-panel' },
      h('h2', {}, 'Team'),
      h(
        'div',
        { class: 'team' },
        members.map((m) =>
          h(
            'div',
            { class: `member wounds-${m.wounds}` },
            h('div', { class: 'member-head' }, h('strong', {}, m.name), h('span', { class: `wound-pill w${m.wounds}` }, WOUND_LABEL[m.wounds])),
            h('div', { class: 'member-role' }, ROLE_LABEL[m.role]),
            !isAlive(m)
              ? h('div', { class: 'stats' }, 'Lost')
              : h(
                  'div',
                  { class: 'stats' },
                  STATS.map((st) => {
                    const eff = effectiveStat(m, st);
                    return h(
                      'span',
                      { class: 'stat', title: `${STAT_LABEL[st]}: ${eff} (base ${m.stats[st]})` },
                      `${STAT_LABEL[st]} `,
                      h('b', {}, String(eff)),
                      eff < m.stats[st] ? h('s', {}, String(m.stats[st])) : null,
                    );
                  }),
                ),
            medicReady && isAlive(m) && m.wounds > 0
              ? h('button', { class: 'small', onclick: () => act(() => { const r = medicTreat(exp!, m.id); if (r.ok) exp = r.state; else message = errorText(r.error); }) }, 'Medic: treat')
              : null,
          ),
        ),
      ),
    );
  }

  function briefingPanel(): HTMLElement {
    return h(
      'section',
      { class: 'panel encounter' },
      h('h2', {}, 'Briefing'),
      h('p', {}, `The address is dialled. Before you send the team through, you can probe the far side for ${PROBE_COST} power.`),
      probe
        ? h('div', { class: 'probe' }, h('strong', {}, `Probe: hazard ${probe.hazard} (${HAZARD_LABEL[probe.hazard]}).`), ' ', probe.hint)
        : h('button', { disabled: power < PROBE_COST, onclick: () => act(doProbe) }, `Probe (${PROBE_COST} power)`),
      h('div', { class: 'controls' }, h('button', { class: 'primary', onclick: () => act(launch) }, 'Send the team through')),
      h('p', { class: 'message' }, message),
    );
  }

  function encounterPanel(): HTMLElement {
    const s = exp!;
    const enc = currentEncounter(s, ENCOUNTERS)!;
    const living = s.team.filter(isAlive);
    return h(
      'section',
      { class: 'panel encounter' },
      h('h2', {}, `Encounter ${s.step + 1} of ${s.world.encounters.length}`),
      h('h3', { class: 'enc-title' }, enc.title),
      h('p', { class: 'enc-text' }, enc.text),
      h(
        'div',
        { class: 'choices' },
        enc.choices.map((c) => {
          const blocked = choiceBlocked(s, c);
          const meta = [
            c.check ? `${STAT_LABEL[c.check.stat]} check` : null,
            c.check?.favoredRole ? `${ROLE_LABEL[c.check.favoredRole]} bonus` : null,
            c.powerCost ? `${c.powerCost} power` : null,
          ].filter(Boolean);
          return h(
            'div',
            { class: `choice ${blocked ? 'blocked' : ''}` },
            h('div', { class: 'choice-label' }, c.label),
            meta.length ? h('div', { class: 'choice-meta' }, meta.join(' · ')) : null,
            blocked
              ? h('div', { class: 'choice-meta warn-text' }, 'Not enough power')
              : c.check
                ? h(
                    'div',
                    { class: 'actors' },
                    h('span', { class: 'muted small-text' }, 'Who attempts it?'),
                    living.map((m) => {
                      const p = successChance(m, c.check!, s.world.hazard, s.config);
                      return h('button', { class: 'actor', onclick: () => act(() => take(c, m.id)), title: `${m.name} (${ROLE_LABEL[m.role]})` }, `${m.name.split(' ')[0]} `, h('b', {}, `${Math.round(p * 100)}%`));
                    }),
                  )
                : h('button', { class: 'actor', onclick: () => act(() => take(c, null)) }, 'Choose'),
          );
        }),
      ),
      h(
        'div',
        { class: 'controls' },
        h(
          'button',
          { class: 'danger', disabled: s.power < s.config.emergencyCost, onclick: () => act(() => { const r = emergencyDialOut(s); if (r.ok) { exp = r.state; lastResolution = null; } else message = errorText(r.error); }) },
          `Emergency dial-out (${s.config.emergencyCost} power)`,
        ),
        !canAffordReturn(s) ? h('span', { class: 'warn-text' }, `Warning: below the ${s.config.returnCost} power needed to dial home.`) : null,
      ),
      h('p', { class: 'message' }, message),
    );
  }

  function resolutionPanel(r: Resolution, withContinue: boolean): HTMLElement {
    return h(
      'section',
      { class: `panel resolution ${r.success ? 'win' : 'loss'}` },
      h('h2', {}, r.chance === null ? 'Outcome' : r.success ? `Success (${Math.round(r.chance * 100)}% chance)` : `Failure (${Math.round(r.chance * 100)}% chance)`),
      h('p', { class: 'enc-text' }, r.text),
      r.applied.length ? h('ul', { class: 'effects' }, r.applied.map((a) => h('li', { class: `fx fx-${fxTone(a)}` }, effectText(a, nameOf)))) : null,
      withContinue ? h('div', { class: 'controls' }, h('button', { class: 'primary', onclick: () => act(() => { lastResolution = null; }) }, 'Continue')) : null,
    );
  }

  function endPanel(): HTMLElement {
    const s = exp!;
    if (s.status === 'complete') {
      const affordable = canAffordReturn(s);
      return h(
        'section',
        { class: 'panel encounter' },
        h('h2', {}, 'Expedition complete'),
        h('p', {}, affordable ? 'The ring is close. Dial home?' : `You have ${s.power} power; dialling home needs ${s.config.returnCost}. If you dial without it, the team will be stranded.`),
        h('div', { class: 'controls' }, h('button', { class: affordable ? 'primary' : 'danger', onclick: () => act(() => { const r = returnHome(s); if (r.ok) { exp = r.state; lastResolution = null; } }) }, `Dial home (${s.config.returnCost} power)`)),
      );
    }
    const headline: Record<string, string> = {
      returned: 'The team is home.',
      evacuated: 'Emergency dial-out. The team made it back.',
      stranded: 'Not enough power to dial home. The team is stranded and lost.',
      wiped: 'The whole team was lost.',
    };
    const lost = s.status === 'stranded' || s.status === 'wiped';
    const haul = s.haul;
    const items = (Object.keys(haul.items) as AidKind[]).filter((k) => haul.items[k] > 0);
    return h(
      'section',
      { class: `panel resolution ${lost ? 'loss' : 'win'}` },
      h('h2', {}, 'Expedition over'),
      h('p', { class: 'enc-text' }, h('strong', {}, headline[s.status] ?? s.status)),
      lost
        ? h('p', { class: 'muted' }, 'Everything they carried is lost with them.')
        : h(
            'ul',
            { class: 'effects' },
            h('li', {}, `Salvage: ${haul.salvage}`),
            items.length ? h('li', {}, `Tech: ${items.map((k) => `${ITEM_LABEL[k]} ×${haul.items[k]}`).join(', ')}`) : null,
            h('li', {}, `Address fragments: ${haul.fragments.length ? haul.fragments.join(', ') : 'none'}`),
            h('li', {}, `Power remaining: ${s.power}`),
          ),
      h('div', { class: 'controls' }, h('button', { class: 'primary', onclick: opts.onNewWorld }, 'New world')),
    );
  }

  function logPanel(): HTMLElement {
    return h(
      'section',
      { class: 'panel log-panel' },
      h('h2', {}, 'Expedition log'),
      h(
        'ol',
        { class: 'exp-log' },
        exp!.log.map((r) => {
          const enc = ENCOUNTERS.find((d) => d.id === r.encounterId);
          const choice = enc?.choices.find((c) => c.id === r.choiceId);
          return h('li', {}, h('strong', {}, enc?.title ?? r.encounterId), ` — ${choice?.label ?? r.choiceId}`, r.actorId ? ` (${nameOf(r.actorId)})` : '', r.chance === null ? '' : r.success ? ': success' : ': failure');
        }),
      ),
    );
  }

  render();
  return { dispose() {} };
}

function progressText(s: ExpeditionState): string {
  const n = s.world.encounters.length;
  switch (s.status) {
    case 'encounter':
      return `Encounter ${s.step + 1} of ${n}`;
    case 'complete':
      return `All ${n} encounters done`;
    default:
      return `Ended: ${s.status}`;
  }
}

function fxTone(a: AppliedEffect): 'good' | 'bad' | 'neutral' {
  switch (a.kind) {
    case 'wound':
      return 'bad';
    case 'power':
      return a.amount < 0 ? 'bad' : 'good';
    case 'spared':
      return 'neutral';
    default:
      return 'good';
  }
}

function effectText(a: AppliedEffect, nameOf: (id: string) => string): string {
  switch (a.kind) {
    case 'salvage':
      return `+${a.amount} salvage`;
    case 'item':
      return `+${a.amount} ${ITEM_LABEL[a.item]}`;
    case 'power':
      return `${a.amount >= 0 ? '+' : ''}${a.amount} power`;
    case 'wound':
      return a.died ? `${nameOf(a.memberId)} was killed.` : `${nameOf(a.memberId)}: ${WOUND_LABEL[a.from as 0]} → ${WOUND_LABEL[a.to as 0]}`;
    case 'heal':
      return `${nameOf(a.memberId)} recovers: ${WOUND_LABEL[a.from as 0]} → ${WOUND_LABEL[a.to as 0]}`;
    case 'fragment':
      return a.strength === 'major' ? 'Address fragment (a glyph and its slot)' : 'Address fragment (a partial clue)';
    case 'spared':
      return `${nameOf(a.memberId)} escaped unhurt.`;
  }
}

function errorText(e: ExpeditionError): string {
  switch (e.kind) {
    case 'no-power':
      return `Not enough power (need ${e.needed}, have ${e.have}).`;
    case 'actor-required':
      return 'Choose who attempts it.';
    case 'invalid-actor':
      return 'That member cannot act.';
    case 'medic-used':
      return 'The medic has already treated someone here.';
    case 'no-medic':
      return 'No medic is fit to treat anyone.';
    case 'nothing-to-treat':
      return 'Nothing to treat.';
    default:
      return 'That is not possible right now.';
  }
}

function powerMeter(power: number, max: number): HTMLElement {
  const pct = Math.max(0, Math.min(100, (power / max) * 100));
  return h(
    'div',
    { class: 'power', title: `Power reserve: ${power}` },
    h('span', {}, 'Power'),
    h('div', { class: 'power-bar' }, h('div', { class: 'power-fill', style: `width:${pct}%` })),
    h('span', { class: 'power-num' }, String(power)),
  );
}
