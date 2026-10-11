/**
 * The app shell: owns the run, saves it after every change, and switches
 * between the title, base, decode, dial, expedition and end screens.
 */

import {
  RUN_CONFIG,
  type RunResult,
  type RunState,
  applyDecode,
  buyItem,
  callUpRecruit,
  chargeCapacitor,
  convertSalvage,
  decodeStateFor,
  dialKnownWorld,
  finishExcursion,
  healMember,
  launch,
  newRun,
  probe,
  standDown,
  syncExpedition,
} from '../game/run';
import { type KeyValueStorage, clearSave, loadRun, saveRun } from '../game/save';
import { renderBase } from './baseView';
import { mountDecodeView } from './decodeView';
import { isSoundOn, setSoundOn } from './dialPlayer';
import { mountDialView } from './dialView';
import { h } from './dom';
import { mountExpeditionView } from './expeditionView';
import { powerMeter } from './widgets';

type Screen =
  | { kind: 'title'; problem?: string }
  | { kind: 'base' }
  | { kind: 'decode'; leadId: string }
  | { kind: 'dial'; leadId: string }
  | { kind: 'excursion' }
  | { kind: 'end' };

/** localStorage, or an in-memory stand-in when it is unavailable. */
function browserStorage(): KeyValueStorage {
  try {
    const probeKey = 'farpoint.probe';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}

export function startApp(root: HTMLElement): void {
  const storage = browserStorage();
  const topbar = h('header', { class: 'topbar' });
  const screenEl = h('div', { class: 'screen' });
  root.replaceChildren(topbar, screenEl);

  let run: RunState | null = null;
  let screen: Screen = { kind: 'title' };
  let mounted: { dispose(): void } | null = null;
  let message = '';
  let saveFailed = false;

  const loaded = loadRun(storage);
  if (loaded.kind === 'ok') {
    run = loaded.run;
    screen = defaultScreen(run);
  } else if (loaded.kind === 'corrupt') {
    screen = { kind: 'title', problem: `Your saved run could not be loaded (${loaded.reason}).` };
  }

  function defaultScreen(r: RunState): Screen {
    if (r.status !== 'active') return { kind: 'end' };
    if (r.excursion) return { kind: 'excursion' };
    return { kind: 'base' };
  }

  /** Store a new run state and save it. Does not redraw the current screen. */
  function commit(next: RunState) {
    run = next;
    saveFailed = !saveRun(storage, next);
    renderTopbar();
  }

  /** Apply a run action from the base; show its error as a message. */
  function apply(result: RunResult, errorText = 'That is not possible right now.') {
    if (result.ok) {
      commit(result.run);
      message = '';
    } else {
      message = result.error.kind === 'no-salvage' ? `Not enough salvage (need ${result.error.needed}).` : result.error.kind === 'no-power' ? `Not enough power (need ${result.error.needed}).` : errorText;
    }
    show(run && run.status !== 'active' ? { kind: 'end' } : screen.kind === 'base' ? { kind: 'base' } : screen);
  }

  function show(next: Screen) {
    mounted?.dispose();
    mounted = null;
    screen = next;
    renderTopbar();
    window.scrollTo?.(0, 0);
    switch (next.kind) {
      case 'title':
        return renderTitle(next.problem);
      case 'end':
        return renderEnd();
      case 'base':
        return renderBase(screenEl, run!, baseActions, message);
      case 'decode': {
        const r = run!;
        const lead = r.leads.find((l) => l.id === next.leadId)!;
        const ds = decodeStateFor(r, lead.id)!;
        mounted = mountDecodeView(screenEl, ds, {
          title: lead.final ? 'The final address' : `Lead ${lead.id}`,
          onChange: (state) => {
            const res = applyDecode(run!, lead.id, state);
            if (res.ok) commit(res.run);
          },
          onExit: () => show(defaultScreen(run!)),
          onContinue: () => show(defaultScreen(run!)),
          continueLabel: 'Step through the ring',
        });
        return;
      }
      case 'dial': {
        const w = run!.worlds.find((x) => x.leadId === next.leadId)!;
        mounted = mountDialView(screenEl, `Dialling ${w.name}`, w.address, () => show({ kind: 'excursion' }));
        return;
      }
      case 'excursion': {
        mounted = mountExpeditionView(screenEl, {
          get: () => {
            const ex = run!.excursion!;
            return { world: ex.world, probe: ex.probe, probeCost: RUN_CONFIG.probeCost, power: run!.power, team: run!.team, expedition: ex.expedition };
          },
          onProbe: () => {
            const r = probe(run!);
            if (r.ok) commit(r.run);
          },
          onLaunch: () => {
            const r = launch(run!);
            if (r.ok) commit(r.run);
          },
          onStandDown: () => {
            const r = standDown(run!);
            if (r.ok) {
              commit(r.run);
              show(defaultScreen(run!));
            }
          },
          onExpedition: (exp) => commit(syncExpedition(run!, exp)),
          onFinish: () => {
            const r = finishExcursion(run!);
            if (r.ok) {
              commit(r.run);
              message = '';
              show(defaultScreen(run!));
            }
          },
        });
        return;
      }
    }
  }

  const baseActions = {
    decode: (leadId: string) => show({ kind: 'decode', leadId }),
    dialKnown: (leadId: string) => {
      const r = dialKnownWorld(run!, leadId);
      if (r.ok) {
        commit(r.run);
        message = '';
        show({ kind: 'dial', leadId });
      } else apply(r);
    },
    heal: (id: string) => apply(healMember(run!, id)),
    callUp: (id: string) => apply(callUpRecruit(run!, id), 'The team is full.'),
    convert: () => apply(convertSalvage(run!)),
    buy: (item: Parameters<typeof buyItem>[1]) => apply(buyItem(run!, item)),
    chargeCapacitor: () => apply(chargeCapacitor(run!)),
    abandon: () => {
      if (!window.confirm('Abandon this run? It cannot be recovered.')) return;
      clearSave(storage);
      run = null;
      show({ kind: 'title' });
    },
  };

  function startNew(seed: string) {
    clearSave(storage);
    message = '';
    commit(newRun(seed));
    show({ kind: 'base' });
  }

  function renderTopbar() {
    const r = run;
    const parts: (Node | null)[] = [
      h('h1', {}, 'Farpoint'),
      r && screen.kind !== 'title' ? h('span', { class: 'subtitle' }, screenName(screen)) : null,
      r && screen.kind !== 'title'
        ? h(
            'span',
            { class: 'resources' },
            h('span', { title: 'Salvage' }, `Salvage ${r.salvage}`),
            h('span', { title: 'Puzzle aids in stock' }, `Keys ${r.items.reveal} · Filters ${r.items.eliminate} · Capacitors ${r.items.freeDial}`),
            r.freeDials > 0 ? h('span', { class: 'charged' }, `Capacitor charged ×${r.freeDials}`) : null,
          )
        : null,
      saveFailed ? h('span', { class: 'warn-text' }, 'Saving failed: progress will be lost on reload') : null,
      h(
        'button',
        { class: 'sound-toggle', 'aria-pressed': isSoundOn() ? 'true' : 'false', title: 'Toggle sound', onclick: () => { setSoundOn(!isSoundOn()); renderTopbar(); } },
        isSoundOn() ? 'Sound on' : 'Sound off',
      ),
      r && screen.kind !== 'title' ? powerMeter(r.power, Math.max(RUN_CONFIG.startPower, r.power)) : null,
    ];
    topbar.replaceChildren(...parts.filter((p): p is Node => p !== null));
  }

  function renderTitle(problem?: string) {
    const seedInput = h('input', { class: 'seed-input', placeholder: 'random', 'aria-label': 'Seed (optional)', maxlength: 40 });
    screenEl.replaceChildren(
      h(
        'main',
        { class: 'title-screen' },
        h(
          'section',
          { class: 'panel title-panel' },
          h('h2', {}, 'An ancient ring. A network of worlds.'),
          h('p', {}, 'Decode addresses from recovered fragments, dial the ring, and send your team through. Find the final address and reach the Farpoint.'),
          problem ? h('p', { class: 'warn-text' }, problem, ' Starting a new run will replace it.') : null,
          run ? h('button', { class: 'primary', onclick: () => show(defaultScreen(run!)) }, 'Continue run') : null,
          h(
            'div',
            { class: 'controls new-run' },
            h('label', {}, 'Seed ', seedInput),
            h(
              'button',
              {
                class: run ? '' : 'primary',
                onclick: () => {
                  if (run && run.status === 'active' && !window.confirm('Start a new run? Your current run will be lost.')) return;
                  startNew((seedInput as HTMLInputElement).value.trim() || Date.now().toString(36));
                },
              },
              'New run',
            ),
          ),
        ),
      ),
    );
  }

  function renderEnd() {
    const r = run!;
    const won = r.status === 'won';
    screenEl.replaceChildren(
      h(
        'main',
        { class: 'title-screen' },
        h(
          'section',
          { class: `panel title-panel ${won ? 'win' : 'loss'}` },
          h('h2', {}, won ? 'You reached the Farpoint.' : 'The run is over.'),
          h('p', {}, r.journal[0] ?? ''),
          h(
            'ul',
            { class: 'effects' },
            h('li', {}, `Expeditions: ${r.stats.expeditions}`),
            h('li', {}, `Dial attempts: ${r.stats.dials}`),
            h('li', {}, `Fragments recovered: ${r.stats.fragments}`),
            h('li', {}, `Team members lost: ${r.stats.deaths}`),
            h('li', {}, `Seed: ${r.seed}`),
          ),
          h('button', { class: 'primary', onclick: () => startNew(Date.now().toString(36)) }, 'New run'),
        ),
      ),
    );
  }

  show(screen);
}

function screenName(s: Screen): string {
  switch (s.kind) {
    case 'base':
      return 'Base';
    case 'decode':
      return 'Decode';
    case 'dial':
      return 'Dialling';
    case 'excursion':
      return 'Expedition';
    case 'end':
      return 'Run over';
    default:
      return '';
  }
}
