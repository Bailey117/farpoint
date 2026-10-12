/**
 * Screens: title, briefing, shift, report. The game modules decide
 * everything; this file only shows it and runs the clock.
 */

import { type Campaign, type KeyValueStorage, isFinished, load, newCampaign, recordShift, save } from '../game/campaign';
import { BASE_NAME } from '../game/data';
import { MAX_DAY, RULES, activeRules, duressDigit } from '../game/rules';
import { Rng, deriveSeed } from '../game/rng';
import { type CallResult, type Decision, HOSTILE_LIMIT, type Mode, type ShiftReport, type ShiftState, decide, report, startShift, timeLimit } from '../game/shift';
import type { Reference, TeamStatus } from '../game/types';
import { h } from './dom';
import { Portal } from './portal';
import { cue, setSound, soundOn } from './sound';

const storage: KeyValueStorage = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const freshSeed = () => `shift-${Date.now().toString(36)}`;

const STATUS_LABEL: Record<TeamStatus, string> = { offworld: 'Off-world', overdue: 'Overdue', home: 'On base', missing: 'Missing' };

export function startApp(root: HTMLElement) {
  let campaign: Campaign;
  let notice = '';
  const loaded = load(storage);
  if (loaded.kind === 'ok') campaign = loaded.campaign;
  else {
    campaign = newCampaign(freshSeed());
    if (loaded.kind === 'corrupt') notice = `Your saved progress could not be read (${loaded.reason}), so a new campaign has started.`;
  }
  let teardown: (() => void) | null = null;

  const show = (render: () => void) => {
    teardown?.();
    teardown = null;
    render();
    window.scrollTo(0, 0);
  };

  // -------------------------------------------------------------------------
  // Title
  // -------------------------------------------------------------------------

  function title() {
    const seedInput = h('input', { class: 'seed', value: '', placeholder: 'random', 'aria-label': 'Endless seed', maxlength: 40 });
    let armed = false;
    const reset = h('button', { class: 'small' }, 'Start the campaign over');
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Click again to wipe campaign progress';
        return;
      }
      campaign = newCampaign(freshSeed(), campaign.endlessBest);
      save(storage, campaign);
      show(title);
    });
    const done = isFinished(campaign);
    root.replaceChildren(
      topbar(null),
      h(
        'main',
        { class: 'title' },
        h('section', { class: 'card intro' },
          h('h1', {}, 'Shutter Duty'),
          h('p', {}, `You are the ring attendant at ${BASE_NAME}, the Survey's second ring site. Teams coming home send an ID code before they step through. You have seconds to check it against today's paperwork and decide: open the shutter, or keep it shut.`),
          h('p', { class: 'muted' }, 'Open for a hostile and the base takes the damage. Keep a genuine team out and they are lost for good.'),
          notice ? h('p', { class: 'warn' }, notice) : null,
        ),
        h('section', { class: 'card' },
          h('h2', {}, 'Campaign'),
          h('p', {}, done ? 'All seven days are done. The campaign is complete.' : `Day ${campaign.day} of ${MAX_DAY}. Each day brings one new order.`),
          campaign.lost.length ? h('p', { class: 'muted' }, `Teams lost so far: ${campaign.lost.length}.`) : null,
          h('div', { class: 'row' },
            done ? null : h('button', { class: 'primary', onclick: () => show(() => briefing('campaign', campaign.seed)) }, campaign.day === 1 && campaign.reports.length === 0 ? 'Start day 1' : `Continue: day ${campaign.day}`),
            campaign.reports.some((r) => r.mode === 'campaign') || done ? reset : null,
          ),
        ),
        h('section', { class: 'card' },
          h('h2', {}, 'Endless'),
          h('p', {}, 'Every order in force, a faster clock as you go, until the base is overrun. The same seed gives the same arrivals.'),
          h('p', { class: 'muted' }, campaign.endlessBest ? `Best: ${campaign.endlessBest.score} correct calls (seed "${campaign.endlessBest.seed}").` : 'No endless shift played yet.'),
          h('div', { class: 'row' },
            h('label', { class: 'muted' }, 'Seed ', seedInput),
            h('button', { onclick: () => show(() => briefing('endless', seedInput.value.trim() || freshSeed())) }, 'Start endless'),
          ),
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Briefing
  // -------------------------------------------------------------------------

  function briefing(mode: Mode, seed: string) {
    const day = mode === 'campaign' ? campaign.day : MAX_DAY;
    const state = startShift({ mode, seed, day, lost: mode === 'campaign' ? campaign.lost : [] });
    const fresh = RULES.find((r) => r.day === day)!;
    const start = () => show(() => shift(state));
    root.replaceChildren(
      topbar(state),
      h(
        'main',
        { class: 'title' },
        h('section', { class: 'card' },
          h('h2', {}, mode === 'campaign' ? `Day ${day} · ${state.ref.date}` : `Endless · seed "${seed}"`),
          mode === 'campaign' ? h('div', { class: 'new-order' }, h('strong', {}, `New order: ${fresh.title}. `), fresh.briefing) : h('p', {}, 'All seven orders are in force.'),
          h('h3', {}, 'Standing orders'),
          h('ol', { class: 'orders' }, activeRules(day).map((r) => h('li', { class: r.day === day && mode === 'campaign' ? 'fresh' : '' }, h('strong', {}, r.title), ': ', r.briefing))),
          h('p', { class: 'muted' }, `${state.total ? `${state.total} arrivals expected. ` : ''}${timeLimit(state)} seconds per call. ${HOSTILE_LIMIT} hostiles through the ring and you are relieved of duty.`),
          h('p', { class: 'muted' }, 'Keys: O to open, C to keep it closed.'),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: start }, 'Begin shift'), h('button', { onclick: () => show(title) }, 'Back')),
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Shift
  // -------------------------------------------------------------------------

  function shift(initial: ShiftState) {
    let state = initial;
    const portal = new Portal();
    const gaps = new Rng(deriveSeed(state.config.seed, `gaps-${state.config.day}`));
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    let deciding = false;
    let deadline = 0;
    let lastTick = 0;
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, reducedMotion() ? Math.min(ms, 400) : ms));

    const transmission = h('section', { class: 'panel transmission', 'aria-live': 'polite' });
    const reference = h('section', { class: 'panel reference' });
    const status = h('p', { class: 'status', role: 'status' }, 'Shutter closed. Waiting for the ring.');
    const clockFill = h('div', { class: 'clock-fill' });
    const clockNum = h('span', { class: 'clock-num' }, '');
    const openBtn = h('button', { class: 'big open', disabled: true }, 'OPEN ', h('kbd', {}, 'O'));
    const closeBtn = h('button', { class: 'big close', disabled: true }, 'CLOSE ', h('kbd', {}, 'C'));
    openBtn.addEventListener('click', () => call('open'));
    closeBtn.addEventListener('click', () => call('close'));
    let bar = topbar(state);

    root.replaceChildren(
      bar,
      h(
        'main',
        { class: 'desk' },
        transmission,
        h('section', { class: 'centre' }, portal.root, status),
        reference,
        h('section', { class: 'controls' }, h('div', { class: 'clock' }, clockFill, clockNum), h('div', { class: 'buttons' }, openBtn, closeBtn)),
      ),
    );
    drawReference(reference, state.ref, state.config.day);
    drawTransmission(null);

    const onKey = (e: KeyboardEvent) => {
      if (!deciding || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'o') call('open');
      if (k === 'c') call('close');
    };
    document.addEventListener('keydown', onKey);
    teardown = () => {
      document.removeEventListener('keydown', onKey);
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };

    function drawTransmission(a: ShiftState['current']) {
      if (!a) {
        transmission.replaceChildren(h('h2', {}, 'Transmission'), h('p', { class: 'no-signal' }, 'No signal'));
        return;
      }
      const team = state.ref.roster.find((t) => t.id === a.teamId);
      const name = team?.name ?? '(unknown team)';
      transmission.replaceChildren(
        h('h2', {}, 'Incoming transmission'),
        h('dl', { class: 'fields' },
          h('dt', {}, 'ID code'), h('dd', { class: 'code' }, a.code),
          h('dt', {}, 'Claims to be'), h('dd', {}, `Team ${name}`),
          h('dt', {}, 'Sent'), h('dd', { class: 'mono' }, `${a.date} ${a.time}`),
          state.config.day >= 5 ? h('dt', {}, 'Auth digit') : null,
          state.config.day >= 5 ? h('dd', { class: 'code small' }, String(a.auth)) : null,
        ),
        ...(a.story ? [h('p', { class: 'story' }, a.story)] : []),
      );
    }

    function nextArrival() {
      if (state.status !== 'running' || !state.current) {
        finish();
        return;
      }
      status.textContent = 'Shutter closed. Waiting for the ring.';
      later(gaps.int(700, 2200), () => {
        cue('incoming');
        portal.setIncoming(true, reducedMotion());
        status.textContent = 'Incoming wormhole. Check the transmission.';
        later(900, () => {
          drawTransmission(state.current);
          startClock();
        });
      });
    }

    function startClock() {
      deciding = true;
      openBtn.disabled = false;
      closeBtn.disabled = false;
      const limit = timeLimit(state) * 1000;
      deadline = performance.now() + limit;
      lastTick = Infinity;
      const tick = () => {
        const left = deadline - performance.now();
        clockFill.style.width = `${Math.max(0, (left / limit) * 100)}%`;
        clockFill.classList.toggle('low', left < 3000);
        clockNum.textContent = `${Math.max(0, left / 1000).toFixed(1)} s`;
        const whole = Math.ceil(left / 1000);
        if (left < 3000 && whole < lastTick && whole > 0) cue('tick');
        lastTick = whole;
        if (left <= 0) {
          call('timeout');
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    function call(decision: Decision) {
      if (!deciding) return;
      deciding = false;
      cancelAnimationFrame(raf);
      openBtn.disabled = true;
      closeBtn.disabled = true;
      const out = decide(state, decision);
      state = out.state;
      showResult(out.result);
    }

    function showResult(r: CallResult) {
      const name = state.ref.roster.find((t) => t.id === r.arrival.teamId)?.name ?? r.arrival.teamId;
      const timeout = r.decision === 'timeout' ? 'Out of time: the shutter stayed shut. ' : '';
      let text = '';
      if (r.decision === 'open') {
        portal.setShutter(true);
        cue('open');
      } else cue('clank');
      later(r.decision === 'open' ? 550 : 200, () => {
        switch (r.outcome) {
          case 'admitted':
            text = `Correct. Team ${name} is home.`;
            portal.flash('good');
            cue('correct');
            break;
          case 'refused':
            text = `${timeout}Correct to refuse. ${r.reason}`;
            portal.flash('good');
            cue('correct');
            break;
          case 'hostile-admitted':
            text = `Hostile admitted. ${r.reason} The base takes damage.`;
            portal.flash('bad');
            cue('alarm');
            break;
          case 'friendly-lost':
            text = `${timeout}Team ${name} was genuine. They hit the shutter and are lost.`;
            portal.impact();
            portal.flash('bad');
            cue('thud');
            break;
        }
        status.textContent = text;
        status.className = `status ${r.correct ? 'good' : 'bad'}`;
        const fresh = topbar(state);
        bar.replaceWith(fresh);
        bar = fresh;
        if (r.outcome === 'friendly-lost' || r.outcome === 'hostile-admitted') drawReference(reference, state.ref, state.config.day);
      });
      later(r.correct ? 2300 : 3600, () => {
        portal.setShutter(false);
        if (r.decision === 'open') cue('close');
        portal.setIncoming(false);
        cue('collapse');
        status.className = 'status';
        drawTransmission(null);
        clockFill.style.width = '0%';
        clockNum.textContent = '';
        later(500, nextArrival);
      });
    }
    function finish() {
      const r = report(state);
      campaign = recordShift(campaign, state);
      save(storage, campaign);
      show(() => reportScreen(r, state));
    }

    nextArrival();
  }

  function drawReference(el: HTMLElement, ref: Reference, day: number) {
    const name = (id: string) => ref.roster.find((t) => t.id === id)?.name ?? '?';
    const duress = duressDigit(ref);
    el.replaceChildren(
      h('h2', {}, `Reference · ${ref.date}`),
      h('details', { class: 'orders-box', open: day <= 2 },
        h('summary', {}, `Standing orders (${activeRules(day).length})`),
        h('ol', { class: 'orders small' }, activeRules(day).map((r) => h('li', {}, h('strong', {}, r.title), ': ', r.briefing))),
      ),
      h('h3', {}, 'Bulletins'),
      h('ul', { class: 'bulletins' }, ref.bulletins.map((b) => h('li', { class: b.effect ? 'effect' : '' }, h('span', { class: 'mono time' }, b.time), ' ', b.text))),
      ...(duress !== null ? [h('p', { class: 'duress' }, `Duress digit today: ${duress}`)] : []),
      h('h3', {}, 'Valid codes'),
      h('table', { class: 'codes' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Team'), day >= 2 ? h('th', {}, 'Expires') : null)),
        h('tbody', {}, [...ref.codes].sort((a, b) => name(a.teamId).localeCompare(name(b.teamId))).map((c) =>
          h('tr', {}, h('td', { class: 'mono' }, c.code), h('td', {}, name(c.teamId)), day >= 2 ? h('td', { class: `mono ${c.expires < ref.date ? 'expired' : ''}` }, c.expires) : null),
        )),
      ),
      day >= 3
        ? h('div', {},
            h('h3', {}, 'Roster'),
            h('table', { class: 'roster' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Team'), h('th', {}, 'Status'), h('th', {}, 'Remark'))),
              h('tbody', {}, ref.roster.map((t) => h('tr', { class: `st-${t.status}` }, h('td', {}, t.name), h('td', {}, STATUS_LABEL[t.status]), h('td', { class: 'muted' }, t.remark ?? '')))),
            ),
          )
        : h('p', { class: 'muted small' }, 'The roster comes into use on day 3.'),
    );
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  function reportScreen(r: ShiftReport, state: ShiftState) {
    const name = (id: string) => state.ref.roster.find((t) => t.id === id)?.name ?? initialName(id);
    const initialName = (id: string) => startShift({ ...state.config, lost: [] }).ref.roster.find((t) => t.id === id)?.name ?? id;
    const endless = r.mode === 'endless';
    root.replaceChildren(
      topbar(null),
      h(
        'main',
        { class: 'title' },
        h('section', { class: 'card report' },
          h('h2', {}, endless ? `Endless shift · seed "${r.seed}"` : `End of shift · day ${r.day}`),
          h('p', { class: `rating ${r.overrun ? 'bad' : ''}` }, r.rating),
          h('ul', { class: 'summary' },
            h('li', {}, `Correct calls: ${r.correct} of ${r.calls}`),
            h('li', {}, `Friendlies lost: ${r.friendliesLost.length}${r.friendliesLost.length ? ` (${r.friendliesLost.join(', ')})` : ''}`),
            h('li', {}, `Hostiles admitted: ${r.hostilesAdmitted}`),
            endless && campaign.endlessBest ? h('li', {}, `Best endless score: ${campaign.endlessBest.score}`) : null,
          ),
          r.overrun && !endless ? h('p', { class: 'warn' }, 'The base was overrun. Day ' + r.day + ' must be worked again.') : null,
          h('table', { class: 'calls' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Team'), h('th', {}, 'Code'), h('th', {}, 'Your call'), h('th', {}, 'Why'))),
            h('tbody', {}, state.results.map((c) =>
              h('tr', { class: c.correct ? 'ok' : 'miss' },
                h('td', { class: 'mono' }, c.arrival.time),
                h('td', {}, name(c.arrival.teamId)),
                h('td', { class: 'mono' }, c.arrival.code),
                h('td', {}, `${c.correct ? '✓' : '✗'} ${c.decision === 'timeout' ? 'Timed out' : c.decision === 'open' ? 'Opened' : 'Closed'}`),
                h('td', {}, c.reason ?? 'Genuine: everything checked out.'),
              ),
            )),
          ),
          h('div', { class: 'row' },
            !endless && !isFinished(campaign) ? h('button', { class: 'primary', onclick: () => show(() => briefing('campaign', campaign.seed)) }, r.overrun ? `Retry day ${campaign.day}` : `On to day ${campaign.day}`) : null,
            endless ? h('button', { class: 'primary', onclick: () => show(() => briefing('endless', r.seed)) }, 'Same seed again') : null,
            h('button', { onclick: () => show(title) }, 'Title screen'),
          ),
          !endless && isFinished(campaign) ? h('p', {}, 'That was the last day. The campaign is complete.') : null,
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  function topbar(state: ShiftState | null): HTMLElement {
    const damage = state?.hostilesAdmitted ?? 0;
    const soundBtn = h('button', { class: 'small' }, soundOn() ? 'Sound on' : 'Sound off');
    soundBtn.addEventListener('click', () => {
      setSound(!soundOn());
      soundBtn.textContent = soundOn() ? 'Sound on' : 'Sound off';
    });
    return h(
      'header',
      { class: 'topbar' },
      h('strong', { class: 'brand' }, 'SHUTTER DUTY'),
      h('span', { class: 'muted' }, BASE_NAME),
      state
        ? h('span', { class: 'shift-info' }, state.config.mode === 'campaign' ? `Day ${state.config.day} · ${state.results.length} of ${state.total} handled` : `Endless · ${state.results.filter((r) => r.correct).length} correct`)
        : null,
      state
        ? h('span', { class: 'damage', title: `Base damage: ${damage} of ${HOSTILE_LIMIT}` }, 'Damage ', Array.from({ length: HOSTILE_LIMIT }, (_, i) => h('span', { class: `pip ${i < damage ? 'hit' : ''}` })))
        : null,
      soundBtn,
    );
  }

  show(title);
}
