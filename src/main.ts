import './ui/styles.css';
import { createDecode } from './game/decode';
import { deriveSeed } from './game/rng';
import { type MountedView, mountDecodeView } from './ui/decodeView';
import { mountExpeditionView } from './ui/expeditionView';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

type Screen = 'decode' | 'expedition';

function readUrl(): { screen: Screen; seed: string } {
  const params = new URLSearchParams(location.search);
  const screen: Screen = params.get('screen') === 'expedition' ? 'expedition' : 'decode';
  let seed = params.get('seed');
  if (!seed) {
    // The only non-deterministic input: picking a fresh seed for a new session.
    seed = Date.now().toString(36);
    history.replaceState(null, '', `?screen=${screen}&seed=${seed}`);
  }
  return { screen, seed };
}

let mounted: MountedView | null = null;

/** Test harness: `&power=N` sets the expedition's starting power. */
function powerOverride(): number | undefined {
  const n = Number(new URLSearchParams(location.search).get('power'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function go(screen: Screen, seed: string, push: boolean) {
  if (push) history.pushState(null, '', `?screen=${screen}&seed=${seed}`);
  start(screen, seed);
}

function start(screen: Screen, seed: string) {
  mounted?.dispose();
  const next = () => go(screen, deriveSeed(seed, 'next').toString(36), true);
  mounted =
    screen === 'expedition'
      ? mountExpeditionView(root!, seed, { seedLabel: seed, onNewWorld: next, startPower: powerOverride() })
      : mountDecodeView(root!, createDecode(seed), { seedLabel: seed, onNewPuzzle: next });
}

window.addEventListener('popstate', () => {
  const { screen, seed } = readUrl();
  start(screen, seed);
});
const initial = readUrl();
start(initial.screen, initial.seed);
