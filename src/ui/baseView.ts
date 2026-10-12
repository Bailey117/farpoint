/**
 * Base screen: team and reserve, power and inventory, addresses (leads,
 * known worlds, the final address), facilities and the journal.
 */

import { BIOME_INFO } from '../data/biomes';
import type { AidKind } from '../game/decode';
import { deriveKnowledge } from '../game/decode';
import { type Lead, RUN_CONFIG, type RunState, finalLead, finalUnlocked, knownFactions, livingTeam, openLeads } from '../game/run';
import { buildersText, factionBlurb, factionName, standingLabel } from '../game/setting';
import { HAZARD_LABEL, worldHazard } from '../game/world';
import { h } from './dom';
import { ITEM_LABEL, memberCard } from './expeditionView';
import { glyphSvg } from './glyphArt';
import { addressGlyphs } from './decrypt';
import { confirmButton } from './widgets';

export interface BaseActions {
  decode(leadId: string): void;
  dialKnown(leadId: string): void;
  heal(memberId: string): void;
  callUp(recruitId: string): void;
  convert(): void;
  buy(item: AidKind): void;
  chargeCapacitor(): void;
  abandon(): void;
}

/** Known worlds listed before the rest are folded away. */
const KNOWN_SHOWN = 5;

const ITEM_TEXT: Record<AidKind, string> = {
  reveal: 'Reveals one unknown slot of an address',
  eliminate: 'Rules out one glyph from an address',
  freeDial: 'One dial attempt without spending power',
};

export function renderBase(root: HTMLElement, run: RunState, actions: BaseActions, message: string): void {
  const cfg = RUN_CONFIG;
  const team = livingTeam(run);
  const teamFull = team.length >= cfg.maxTeam;

  const teamPanel = h(
    'section',
    { class: 'panel' },
    h('h2', {}, `Team (${team.length}/${cfg.maxTeam})`),
    team.length === 0 ? h('p', { class: 'warn-text' }, 'No one is fit to go. Call up a recruit.') : null,
    h(
      'div',
      { class: 'team' },
      team.map((m) =>
        memberCard(
          m,
          m.wounds > 0
            ? h('button', { class: 'small', disabled: run.salvage < cfg.healCost, onclick: () => actions.heal(m.id) }, `Infirmary: treat (${cfg.healCost} salvage)`)
            : null,
        ),
      ),
    ),
    h('h2', {}, `Reserve (${run.recruits.length})`),
    run.recruits.length === 0
      ? h('p', { class: 'muted' }, 'No recruits in reserve. New volunteers sometimes arrive after an expedition.')
      : h(
          'div',
          { class: 'team' },
          run.recruits.map((m) => memberCard(m, h('button', { class: 'small', disabled: teamFull, onclick: () => actions.callUp(m.id), title: teamFull ? 'The team is full' : '' }, 'Call up'))),
        ),
    run.fallen.length
      ? h(
          'details',
          { class: 'fallen' },
          h('summary', {}, `Fallen (${run.fallen.length})`),
          h('ul', {}, run.fallen.map((m) => h('li', {}, `${m.name}, ${m.role}`))),
        )
      : null,
  );

  const leads = openLeads(run);
  const fin = finalLead(run);
  const known = run.worlds;
  const canDialNow = run.freeDials > 0 || run.power >= cfg.dialCost;

  const addressPanel = h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Partial addresses'),
    leads.length === 0 ? h('p', { class: 'muted' }, 'No open leads.') : null,
    h(
      'div',
      { class: 'leads' },
      leads.map((l) =>
        h(
          'div',
          { class: 'lead' },
          h('div', { class: 'lead-head' }, h('strong', {}, `Lead ${l.id}`), h('span', { class: 'muted' }, `${l.facts.length} clue${l.facts.length === 1 ? '' : 's'} · ${l.attempts.length} dial${l.attempts.length === 1 ? '' : 's'} so far`)),
          glyphRow(l),
          h('button', { class: 'primary small', onclick: () => actions.decode(l.id) }, 'Decode'),
        ),
      ),
    ),
    fin
      ? h(
          'div',
          { class: `lead final ${finalUnlocked(run) ? 'unlocked' : ''}` },
          h('div', { class: 'lead-head' }, h('strong', {}, 'The final address'), h('span', { class: 'muted' }, fin.solved ? 'Resolved' : `${fin.facts.length} / ${cfg.finalUnlockFacts} clues`)),
          glyphRow(fin),
          fin.solved
            ? null
            : finalUnlocked(run)
              ? h('button', { class: 'primary small', onclick: () => actions.decode(fin.id) }, 'Decode the final address')
              : h('p', { class: 'muted small-text' }, `Fragments from hazard ${cfg.finalFragment.minHazard}+ worlds sometimes belong to it. ${cfg.finalUnlockFacts} clues are needed to attempt it.`),
        )
      : null,
    h('h2', {}, 'Known worlds'),
    known.length === 0
      ? h('p', { class: 'muted' }, 'None yet. Decode an address to open a world.')
      : (() => {
          // Newest first; the Farpoint (once open) always stays visible.
          const ordered = [...known].reverse().sort((a, b) => (b.profile.biome === 'final' ? 1 : 0) - (a.profile.biome === 'final' ? 1 : 0));
          const row = (w: (typeof known)[number]) =>
            h(
              'div',
              { class: 'world-row' },
              !w.identified
                ? h('div', {}, h('strong', { class: 'unidentified-name', 'aria-label': 'Unidentified world' }, addressGlyphs(w.address)), h('div', { class: 'muted small-text' }, 'Unidentified world · probe it or go through to learn more'))
                : (() => {
                    const hz = worldHazard(w.profile, run.setting);
                    const holder = run.setting.factions.find((f) => f.id === w.profile.parts?.faction?.id);
                    return h(
                      'div',
                      {},
                      h('strong', {}, w.profile.name),
                      h('div', { class: 'muted small-text' }, `${BIOME_INFO[w.profile.biome].name} · hazard ${hz} (${HAZARD_LABEL[hz] ?? '?'})${holder ? ` · ${holder.name}` : ''} · ${w.visits} visit${w.visits === 1 ? '' : 's'}`),
                    );
                  })(),
              h('button', { class: 'small', disabled: !canDialNow || team.length === 0, onclick: () => actions.dialKnown(w.leadId) }, run.freeDials > 0 ? 'Dial (free)' : `Dial (${cfg.dialCost} power)`),
            );
          const shown = ordered.slice(0, KNOWN_SHOWN);
          const rest = ordered.slice(KNOWN_SHOWN);
          return h(
            'div',
            { class: 'worlds' },
            shown.map(row),
            rest.length ? h('details', { class: 'more-worlds' }, h('summary', {}, `Show ${rest.length} more`), rest.map(row)) : null,
          );
        })(),
  );

  const facilities = h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Facilities'),
    h(
      'div',
      { class: 'facility' },
      h('div', {}, h('strong', {}, 'Generator'), h('div', { class: 'muted small-text' }, `${cfg.generator.salvage} salvage → ${cfg.generator.power} power`)),
      h('button', { class: 'small', disabled: run.salvage < cfg.generator.salvage, onclick: actions.convert }, 'Convert'),
    ),
    (Object.keys(ITEM_LABEL) as AidKind[]).map((k) =>
      h(
        'div',
        { class: 'facility' },
        h('div', {}, h('strong', {}, `Workshop: ${ITEM_LABEL[k]}`), h('div', { class: 'muted small-text' }, `${ITEM_TEXT[k]} · you have ${run.items[k]}`)),
        h('button', { class: 'small', disabled: run.salvage < cfg.itemCost[k], onclick: () => actions.buy(k) }, `Build (${cfg.itemCost[k]})`),
      ),
    ),
    h(
      'div',
      { class: 'facility' },
      h('div', {}, h('strong', {}, 'Charge a capacitor'), h('div', { class: 'muted small-text' }, `Makes your next dial free, including redialling a known world · charged: ${run.freeDials}`)),
      h('button', { class: 'small', disabled: run.items.freeDial <= 0, onclick: actions.chargeCapacitor }, 'Charge'),
    ),
  );

  const factions = knownFactions(run);
  const hidden = run.setting.factions.length - factions.length;
  const network = h(
    'section',
    { class: 'panel network' },
    h('h2', {}, 'The network'),
    h('p', { class: 'muted' }, buildersText(run.setting.builders)),
    h(
      'div',
      { class: 'factions' },
      factions.map((f) =>
        h(
          'div',
          { class: 'faction' },
          h(
            'div',
            { class: 'faction-head' },
            h('strong', {}, f.name),
            h('span', { class: 'faction-tier muted small-text' }, f.tier === 'major' ? 'Major power' : 'Minor group'),
            h('span', { class: `standing standing-${f.standing < 0 ? 'bad' : f.standing > 0 ? 'good' : 'neutral'}`, title: factionName(f) }, standingLabel(f.standing)),
          ),
          h('div', { class: 'muted small-text' }, factionBlurb(f, run.setting)),
        ),
      ),
    ),
    hidden > 0 ? h('p', { class: 'muted small-text' }, `Other groups live in the network too. You will learn of them when you find their worlds.`) : null,
  );

  const journal = h(
    'section',
    { class: 'panel' },
    h('h2', {}, 'Journal'),
    h('ol', { class: 'journal' }, run.journal.slice(0, 12).map((j) => h('li', {}, j))),
    h(
      'div',
      { class: 'run-stats muted small-text' },
      `Expeditions ${run.stats.expeditions} · Dials ${run.stats.dials} · Fragments ${run.stats.fragments} · Lost ${run.stats.deaths}`,
    ),
    confirmButton('Abandon run', 'Click again to abandon for good', actions.abandon, 'small danger'),
  );

  root.replaceChildren(
    h(
      'main',
      { class: 'base' },
      message ? h('p', { class: 'message base-message', role: 'status' }, message) : null,
      h('div', { class: 'base-col' }, addressPanel, facilities),
      h('div', { class: 'base-col' }, teamPanel, network, journal),
    ),
  );
}

/** The address slots, with known glyphs shown and unknown ones as '?'. */
function glyphRow(lead: Lead): HTMLElement {
  const known = deriveKnowledge(lead).slotGlyph;
  return h(
    'div',
    { class: 'glyph-row', style: `grid-template-columns: repeat(${lead.address.length}, minmax(0, 1fr))` },
    lead.address.map((g, i) => {
      const k = lead.solved ? g : known[i];
      return h('span', { class: `mini-slot ${k ? 'known' : ''}`, title: k ? `Slot ${i + 1}` : `Slot ${i + 1}: unknown` }, k ? glyphSvg(k) : '?');
    }),
  );
}
