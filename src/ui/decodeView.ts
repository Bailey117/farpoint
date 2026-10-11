/**
 * Decode screen: compose a 6-glyph attempt, dial it, read the feedback.
 * All rules live in src/game/decode.ts; this file only renders state and
 * forwards player input.
 */

import { type Mark, describeFact } from '../game/address';
import {
  type AidKind,
  type Attempt,
  type DecodeState,
  type DialError,
  type AidError,
  canDial,
  deriveKnowledge,
  dial,
  slotCandidates,
  useAid,
} from '../game/decode';
import { GLYPH_IDS, type GlyphId, glyphName } from '../game/glyphs';
import { h } from './dom';
import { glyphSvg } from './glyphArt';
import { revealedMarks } from './ringTimeline';
import { sharedRing } from './ringStage';

export interface DecodeViewOptions {
  /** Heading for the puzzle, e.g. the lead's name. */
  title: string;
  /** Called after every state change (dial, aid), for saving. */
  onChange?: (state: DecodeState) => void;
  /** Leave the puzzle (back to base). */
  onExit?: () => void;
  /** After the address is solved and the ring has finished dialling. */
  onContinue?: () => void;
  continueLabel?: string;
}

const MARK_LABEL: Record<Mark, string> = {
  locked: 'Locked: right glyph, right slot',
  drifting: 'Drifting: in the address, wrong slot',
  absent: 'Absent: not in the address',
};

/** Shape-coded mark (filled / half / hollow) so marks never rely on colour alone. */
function markDot(m: Mark): HTMLElement {
  return h('span', { class: `dot dot-${m}`, 'aria-hidden': 'true' });
}

const AID_INFO: Record<AidKind, { title: string; text: string }> = {
  reveal: { title: 'Resonance key', text: 'Reveal one unknown slot' },
  eliminate: { title: 'Null filter', text: 'Rule out one glyph' },
  freeDial: { title: 'Capacitor', text: 'Next dial costs no power' },
};

export interface MountedView {
  dispose(): void;
}

export function mountDecodeView(root: HTMLElement, initial: DecodeState, opts: DecodeViewOptions): MountedView {
  let state = initial;
  let draft: (GlyphId | null)[] = [];
  let cursor = 0;
  let message = '';
  /** True while the ring animation plays; the newest attempt stays hidden until it ends. */
  let dialing = false;
  /** The last dial, shown in the slot row with its marks until the player edits again. */
  let result: Attempt | null = null;

  const { view: ring, player } = sharedRing(initial.address.length);
  player.reset(initial.address.length);
  ring.el.onclick = () => {
    if (dialing) player.skip();
  };

  const onKey = (e: KeyboardEvent) => {
    if (dialing && (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      player.skip();
    }
  };
  document.addEventListener('keydown', onKey);

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
    result = null;
    const existing = draft.indexOf(g);
    if (existing !== -1) draft[existing] = null;
    draft[cursor] = g;
    cursor = firstEmpty(draft);
    message = '';
    render();
  }

  function clearSlot(i: number) {
    // The first click on a shown result just returns to editing.
    if (result) {
      result = null;
      render();
      return;
    }
    if (draft[i]) draft[i] = null;
    cursor = i;
    render();
  }

  async function doDial() {
    if (dialing) return;
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
    opts.onChange?.(state);
    const last = state.attempts[state.attempts.length - 1]!;
    dialing = true;
    result = null;
    message = 'Dialing… (click the ring or press Space to skip)';
    render();
    // Light each slot on the exact frame its chevron is struck.
    const slotEls = Array.from(root.querySelectorAll<HTMLButtonElement>('.slot'));
    const lit: (Mark | null)[] = slotEls.map(() => null);
    await player.play(last.guess, last.marks, (frame) => {
      const marks = revealedMarks(frame);
      slotEls.forEach((el, i) => {
        const m = marks[i] ?? null;
        el.classList.toggle('active', frame.activeSlot === i && m === null);
        if (m && !lit[i]) {
          lit[i] = m;
          el.classList.add('revealed', `mark-${m}`, 'hit');
          el.title = `Slot ${i + 1}: ${glyphName(last.guess[i]!)} — ${MARK_LABEL[m]}`;
          el.append(h('span', { class: 'slot-pip' }, markDot(m)));
        }
        // On a successful dial the row charges blue with the chevrons.
        if (frame.chevrons[i]?.light === 'energy' && !el.classList.contains('energized')) el.classList.add('energized');
      });
    });
    dialing = false;
    result = last;
    // Keep locked glyphs in place, clear the rest for the next attempt.
    resetDraft();
    message =
      state.status === 'solved'
        ? 'All chevrons locked. The address is complete.'
        : `${last.marks.filter((m) => m === 'locked').length} locked, ${last.marks.filter((m) => m === 'drifting').length} drifting.`;
    render();
  }

  function doAid(aid: AidKind) {
    result = null;
    const r = useAid(state, aid);
    if (!r.ok) {
      message = aidErrorText(r.error);
    } else {
      state = r.state;
      opts.onChange?.(state);
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
    // While dialing, the result is not revealed anywhere but on the ring.
    const shown: DecodeState = dialing
      ? { ...state, attempts: state.attempts.slice(0, -1), status: 'active' }
      : state;
    const k = deriveKnowledge(shown);
    const affordable = canDial(state);
    const cost = state.freeDials > 0 ? 0 : state.dialCost;

    const slots = h(
      'div',
      { class: 'slots', role: 'group', 'aria-label': 'Dial attempt', style: `grid-template-columns: repeat(${draft.length}, minmax(0, 1fr))` },
      result
        ? result.guess.map((g, i) => {
            const m = result!.marks[i] as Mark;
            return h(
              'button',
              { class: `slot revealed mark-${m} ${shown.status === 'solved' ? 'energized' : ''}`, title: `Slot ${i + 1}: ${glyphName(g)} — ${MARK_LABEL[m]}`, onclick: () => clearSlot(i) },
              h('span', { class: 'slot-num' }, String(i + 1)),
              glyphSvg(g),
              h('span', { class: 'slot-pip' }, markDot(m)),
            );
          })
        : draft.map((g, i) => {
            if (dialing) {
              // Neutral while the ring reveals the result.
              return h(
                'button',
                { class: 'slot', title: `Slot ${i + 1}`, disabled: true },
                h('span', { class: 'slot-num' }, String(i + 1)),
                g ? glyphSvg(g) : h('span', { class: 'slot-empty' }, '·'),
              );
            }
            // Warn only about wasted tests: a glyph known to be absent, ruled out
            // of this slot, or already known to sit in another slot. Testing a
            // new glyph in a solved slot is a good move, so it is not flagged.
            const knownAt = g === null ? -1 : k.slotGlyph.indexOf(g);
            const warn = g !== null && (k.glyphStatus[g] === 'absent' || k.slotExcluded[i]!.has(g) || (knownAt !== -1 && knownAt !== i));
            const probing = g !== null && !warn && k.slotGlyph[i] !== null && k.slotGlyph[i] !== g;
            const cls = ['slot', i === cursor ? 'cursor' : '', g && k.slotGlyph[i] === g ? 'known' : '', warn ? 'warn' : '', probing ? 'probing' : '']
              .filter(Boolean)
              .join(' ');
            return h(
              'button',
              {
                class: cls,
                title: g
                  ? `Slot ${i + 1}: ${glyphName(g)}${warn ? ' (wasted: you already know this)' : probing ? ' (testing a new glyph in a solved slot)' : ''} — click to clear`
                  : `Slot ${i + 1}: empty`,
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
      dialing
        ? h('button', { class: 'primary', onclick: () => player.skip() }, 'Skip ▸')
        : h(
            'button',
            { class: 'primary', disabled: !affordable, onclick: () => void doDial() },
            state.status === 'solved' ? 'Address complete' : `Dial (${cost} power)`,
          ),
      h('button', { disabled: dialing, onclick: () => { result = null; resetDraft(); render(); } }, 'Reset'),
    );

    // Candidate helper: which glyphs could still go in the highlighted slot.
    const slotN = cursor + 1;
    const candidates = new Set(slotCandidates(k, cursor));
    const solvedHere = k.slotGlyph[cursor];
    const openSlots = k.slotGlyph.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0);
    const lastSlot = openSlots.length === 1 ? openSlots[0]! : null;
    const lastCandidates = lastSlot === null ? [] : slotCandidates(k, lastSlot);
    const candidateNames = [...candidates].map(glyphName);
    const helper =
      shown.status === 'solved' || result
        ? null
        : h(
            'p',
            { class: 'candidates', role: 'status' },
            solvedHere
              ? [h('strong', {}, `Slot ${slotN} is solved: `), glyphName(solvedHere), '.']
              : [
                  h('strong', {}, `Slot ${slotN}: ${candidates.size} glyph${candidates.size === 1 ? '' : 's'} could go here`),
                  candidates.size <= 8 ? ` (${candidateNames.join(', ')}).` : '. The others are dimmed.',
                ],
          );
    const endgame =
      lastSlot !== null && lastCandidates.length > 1 && shown.status !== 'solved' && !result
        ? h(
            'div',
            { class: 'endgame-tip' },
            h('strong', {}, `Only slot ${lastSlot + 1} is left, with ${lastCandidates.length} candidates.`),
            ' Put some of them in your solved slots as well: one dial then tests several at once, and you lose nothing because you already know what goes there.',
          )
        : null;

    const palette = h(
      'div',
      { class: 'palette', role: 'group', 'aria-label': 'Glyphs' },
      GLYPH_IDS.map((g) =>
        h(
          'button',
          {
            class: `glyph-btn status-${k.glyphStatus[g]} ${draft.includes(g) ? 'in-draft' : ''} ${!candidates.has(g) && k.glyphStatus[g] !== 'absent' ? 'not-here' : ''}`,
            title: `${glyphName(g)} — ${statusText(k.glyphStatus[g])}${!candidates.has(g) && k.glyphStatus[g] !== 'absent' ? `; cannot go in slot ${slotN}` : ''}`,
            disabled: dialing,
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
            disabled: dialing || state.aids[aid] <= 0 || state.status === 'solved',
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
      h('h2', {}, `Dial log (${shown.attempts.length})`),
      h(
        'p',
        { class: 'legend' },
        (['locked', 'drifting', 'absent'] as Mark[]).map((m) => h('span', { class: `mark mark-${m}` }, markDot(m), ` ${m}`)),
      ),
      shown.attempts.length === 0
        ? h('p', { class: 'muted' }, 'No attempts yet.')
        : h(
            'ol',
            { class: 'attempts', reversed: true },
            shown.attempts
              .map((a, n) =>
                h(
                  'li',
                  { class: 'attempt' },
                  h('span', { class: 'attempt-num' }, `#${n + 1}`),
                  a.guess.map((g, i) => {
                    const m = a.marks[i] as Mark;
                    return h('span', { class: `cell mark-${m}`, title: `${glyphName(g)}: ${MARK_LABEL[m]}` }, glyphSvg(g), h('span', { class: 'pip' }, markDot(m)));
                  }),
                  h('span', { class: 'attempt-cost' }, a.cost === 0 ? 'free' : `−${a.cost}`),
                ),
              )
              .reverse(),
          ),
    );

    const banner =
      shown.status === 'solved'
        ? h(
            'div',
            { class: 'banner success' },
            h('strong', {}, 'Address resolved.'),
            ` Solved in ${shown.attempts.length} attempt${shown.attempts.length === 1 ? '' : 's'}.`,
            opts.onContinue ? h('button', { class: 'primary', onclick: opts.onContinue }, opts.continueLabel ?? 'Step through') : null,
          )
        : shown.status === 'stalled'
          ? h(
              'div',
              { class: 'banner danger' },
              h('strong', {}, 'Not enough power.'),
              shown.aids.freeDial > 0 ? ' A Capacitor can still power one more dial.' : ' Convert salvage at the base generator to keep dialling.',
              opts.onExit ? h('button', { onclick: opts.onExit }, 'Back to base') : null,
            )
          : null;

    root.replaceChildren(
      h(
        'main',
        { class: 'decode' },
        h(
          'section',
          { class: 'stage panel' },
          h(
            'div',
            { class: 'stage-head' },
            opts.onExit ? h('button', { class: 'small', disabled: dialing, onclick: opts.onExit }, '← Base') : null,
            h('h2', {}, opts.title),
          ),
          ring.el,
          slots,
          controls,
          h('p', { class: 'message', role: 'status', 'aria-live': 'polite' }, message),
          banner,
        ),
        h(
          'div',
          { class: 'side' },
          h(
            'section',
            { class: 'panel' },
            h('h2', {}, 'Glyphs'),
            h('p', { class: 'muted' }, 'Pick glyphs to fill the highlighted slot. Click a slot to clear it.'),
            h('p', { class: 'muted tip' }, 'Tip: a slot you have already solved can hold an untested glyph instead. You learn more from each dial.'),
            endgame,
            helper,
            palette,
            h('h2', {}, 'Puzzle aids'),
            aids,
          ),
          facts,
          history,
        ),
      ),
    );
  }

  render();

  return {
    dispose() {
      document.removeEventListener('keydown', onKey);
      player.dispose();
      ring.el.onclick = null;
    },
  };
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
