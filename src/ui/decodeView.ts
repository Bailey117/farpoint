/**
 * Decode screen: compose a 6-glyph attempt, dial it, read the feedback.
 * All rules live in src/game/decode.ts; this file only renders state and
 * forwards player input.
 */

import { type Mark, describeFact } from '../game/address';
import {
  type AidKind,
  type DecodeState,
  type DialError,
  type AidError,
  canDial,
  deriveKnowledge,
  dial,
  useAid,
} from '../game/decode';
import { GLYPH_IDS, type GlyphId, glyphName } from '../game/glyphs';
import { h } from './dom';
import { glyphSvg } from './glyphArt';

export interface DecodeViewOptions {
  seedLabel: string;
  onNewPuzzle: () => void;
}

const MARK_LABEL: Record<Mark, string> = {
  locked: 'Locked: right glyph, right slot',
  drifting: 'Drifting: in the address, wrong slot',
  absent: 'Absent: not in the address',
};

const MARK_SYMBOL: Record<Mark, string> = { locked: '●', drifting: '◐', absent: '○' };

const AID_INFO: Record<AidKind, { title: string; text: string }> = {
  reveal: { title: 'Resonance key', text: 'Reveal one unknown slot' },
  eliminate: { title: 'Null filter', text: 'Rule out one glyph' },
  freeDial: { title: 'Capacitor', text: 'Next dial costs no power' },
};

export function mountDecodeView(root: HTMLElement, initial: DecodeState, opts: DecodeViewOptions): void {
  let state = initial;
  let draft: (GlyphId | null)[] = [];
  let cursor = 0;
  let message = '';

  const resetDraft = () => {
    const k = deriveKnowledge(state);
    draft = k.slotGlyph.slice();
    cursor = firstEmpty(draft);
  };
  resetDraft();

  function firstEmpty(d: (GlyphId | null)[]): number {
    const i = d.indexOf(null);
    return i === -1 ? d.length - 1 : i;
  }

  function placeGlyph(g: GlyphId) {
    if (state.status === 'solved') return;
    const existing = draft.indexOf(g);
    if (existing !== -1) draft[existing] = null;
    draft[cursor] = g;
    cursor = firstEmpty(draft);
    message = '';
    render();
  }

  function clearSlot(i: number) {
    if (draft[i]) draft[i] = null;
    cursor = i;
    render();
  }

  function doDial() {
    if (draft.some((g) => g === null)) {
      message = 'Fill every slot before dialing.';
      render();
      return;
    }
    const r = dial(state, draft as GlyphId[]);
    if (!r.ok) {
      message = dialErrorText(r.error);
      render();
      return;
    }
    state = r.state;
    const last = state.attempts[state.attempts.length - 1]!;
    // Keep locked glyphs in place, clear the rest for the next attempt.
    resetDraft();
    message =
      state.status === 'solved'
        ? 'All chevrons locked. The address is complete.'
        : `${last.marks.filter((m) => m === 'locked').length} locked, ${last.marks.filter((m) => m === 'drifting').length} drifting.`;
    render();
  }

  function doAid(aid: AidKind) {
    const r = useAid(state, aid);
    if (!r.ok) {
      message = aidErrorText(r.error);
    } else {
      state = r.state;
      const k = deriveKnowledge(state);
      // Drop newly revealed glyphs into their slots without wiping the draft.
      k.slotGlyph.forEach((g, i) => {
        if (g && draft[i] !== g) {
          const elsewhere = draft.indexOf(g);
          if (elsewhere !== -1) draft[elsewhere] = null;
          draft[i] = g;
        }
      });
      cursor = firstEmpty(draft);
      message = aid === 'freeDial' ? 'Capacitor charged: next dial is free.' : 'New information added to the fragment log.';
    }
    render();
  }

  function render() {
    const k = deriveKnowledge(state);
    const affordable = canDial(state);
    const cost = state.freeDials > 0 ? 0 : state.dialCost;

    const header = h(
      'header',
      { class: 'topbar' },
      h('h1', {}, 'Farpoint'),
      h('span', { class: 'subtitle' }, 'Address decode'),
      h('span', { class: 'seed', title: 'Puzzle seed' }, `seed ${opts.seedLabel}`),
      powerMeter(state.power, Math.max(initial.power, state.power)),
    );

    const slots = h(
      'div',
      { class: 'slots', role: 'group', 'aria-label': 'Dial attempt', style: `grid-template-columns: repeat(${draft.length}, minmax(0, 1fr))` },
      draft.map((g, i) => {
        const warn =
          g !== null &&
          (k.glyphStatus[g] === 'absent' || k.slotExcluded[i]?.has(g) || (k.slotGlyph[i] !== null && k.slotGlyph[i] !== g));
        const cls = ['slot', i === cursor ? 'cursor' : '', g && k.slotGlyph[i] === g ? 'known' : '', warn ? 'warn' : '']
          .filter(Boolean)
          .join(' ');
        return h(
          'button',
          {
            class: cls,
            title: g ? `Slot ${i + 1}: ${glyphName(g)}${warn ? ' (contradicts what you know)' : ''} — click to clear` : `Slot ${i + 1}: empty`,
            onclick: () => clearSlot(i),
          },
          h('span', { class: 'slot-num' }, String(i + 1)),
          g ? glyphSvg(g) : h('span', { class: 'slot-empty' }, '·'),
        );
      }),
    );

    const controls = h(
      'div',
      { class: 'controls' },
      h(
        'button',
        { class: 'primary', disabled: !affordable, onclick: doDial },
        state.status === 'solved' ? 'Address complete' : `Dial (${cost} power)`,
      ),
      h('button', { onclick: () => { resetDraft(); render(); } }, 'Reset'),
    );

    const palette = h(
      'div',
      { class: 'palette', role: 'group', 'aria-label': 'Glyphs' },
      GLYPH_IDS.map((g) =>
        h(
          'button',
          {
            class: `glyph-btn status-${k.glyphStatus[g]} ${draft.includes(g) ? 'in-draft' : ''}`,
            title: `${glyphName(g)} — ${statusText(k.glyphStatus[g])}`,
            onclick: () => placeGlyph(g),
          },
          glyphSvg(g),
          h('span', { class: 'glyph-name' }, glyphName(g)),
        ),
      ),
    );

    const aids = h(
      'div',
      { class: 'aids' },
      (Object.keys(AID_INFO) as AidKind[]).map((aid) =>
        h(
          'button',
          {
            class: 'aid',
            disabled: state.aids[aid] <= 0 || state.status === 'solved',
            onclick: () => doAid(aid),
            title: AID_INFO[aid].text,
          },
          h('strong', {}, AID_INFO[aid].title),
          h('span', {}, AID_INFO[aid].text),
          h('span', { class: 'count' }, `×${state.aids[aid]}`),
        ),
      ),
    );

    const facts = h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Fragment log'),
      state.facts.length === 0
        ? h('p', { class: 'muted' }, 'No fragments recovered.')
        : h('ul', { class: 'facts' }, state.facts.map((f) => h('li', { class: `fact fact-${f.kind}` }, glyphSvg(f.glyph, 'glyph tiny'), describeFact(f, glyphName)))),
    );

    const history = h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Dial log (${state.attempts.length})`),
      h(
        'p',
        { class: 'legend' },
        (['locked', 'drifting', 'absent'] as Mark[]).map((m) => h('span', { class: `mark mark-${m}` }, `${MARK_SYMBOL[m]} ${m}`)),
      ),
      state.attempts.length === 0
        ? h('p', { class: 'muted' }, 'No attempts yet.')
        : h(
            'ol',
            { class: 'attempts', reversed: true },
            state.attempts
              .map((a, n) =>
                h(
                  'li',
                  { class: 'attempt' },
                  h('span', { class: 'attempt-num' }, `#${n + 1}`),
                  a.guess.map((g, i) => {
                    const m = a.marks[i] as Mark;
                    return h('span', { class: `cell mark-${m}`, title: `${glyphName(g)}: ${MARK_LABEL[m]}` }, glyphSvg(g), h('span', { class: 'pip' }, MARK_SYMBOL[m]));
                  }),
                  h('span', { class: 'attempt-cost' }, a.cost === 0 ? 'free' : `−${a.cost}`),
                ),
              )
              .reverse(),
          ),
    );

    const banner =
      state.status === 'solved'
        ? h('div', { class: 'banner success' }, h('strong', {}, 'Address resolved.'), ` Solved in ${state.attempts.length} attempt${state.attempts.length === 1 ? '' : 's'}.`, h('button', { onclick: opts.onNewPuzzle }, 'New address'))
        : state.status === 'stalled'
          ? h(
              'div',
              { class: 'banner danger' },
              h('strong', {}, 'Power exhausted.'),
              state.aids.freeDial > 0 ? ' A Capacitor can still power one more dial.' : ' The ring cannot be dialed again.',
              h('button', { onclick: opts.onNewPuzzle }, 'New address'),
            )
          : null;

    root.replaceChildren(
      header,
      h(
        'main',
        { class: 'decode' },
        h(
          'section',
          { class: 'composer panel' },
          h('h2', {}, 'Compose attempt'),
          h('p', { class: 'muted' }, 'Pick glyphs to fill the highlighted slot. Click a slot to clear it.'),
          slots,
          controls,
          h('p', { class: 'message', role: 'status', 'aria-live': 'polite' }, message),
          banner,
          palette,
          h('h2', {}, 'Puzzle aids'),
          aids,
        ),
        h('div', { class: 'side' }, facts, history),
      ),
    );
  }

  render();
}

function statusText(s: string): string {
  switch (s) {
    case 'absent':
      return 'not in the address';
    case 'present':
      return 'in the address, slot unknown';
    case 'locked':
      return 'slot known';
    default:
      return 'unknown';
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

function dialErrorText(e: DialError): string {
  switch (e.kind) {
    case 'no-power':
      return `Not enough power (${e.power} of ${e.cost}).`;
    case 'not-active':
      return e.status === 'solved' ? 'Already solved.' : 'No power left to dial.';
    case 'invalid-guess':
      switch (e.problem.kind) {
        case 'repeat':
          return `${glyphName(e.problem.glyph)} is used twice.`;
        case 'length':
          return 'Fill every slot before dialing.';
        case 'unknown-glyph':
          return 'Unknown glyph.';
      }
  }
}

function aidErrorText(e: AidError): string {
  switch (e.kind) {
    case 'no-charges':
      return 'No charges left for that aid.';
    case 'nothing-to-reveal':
      return 'Every slot is already known.';
    case 'nothing-to-eliminate':
      return 'Every absent glyph is already ruled out.';
    case 'not-active':
      return 'The puzzle is already solved.';
  }
}
