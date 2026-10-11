import './ui/styles.css';
import { createDecode } from './game/decode';
import { deriveSeed } from './game/rng';
import { type MountedView, mountDecodeView } from './ui/decodeView';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

function currentSeed(): string {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  if (fromUrl) return fromUrl;
  // The only non-deterministic input: picking a fresh seed for a new session.
  const fresh = Date.now().toString(36);
  history.replaceState(null, '', `?seed=${fresh}`);
  return fresh;
}

let mounted: MountedView | null = null;

function start(seed: string) {
  mounted?.dispose();
  mounted = mountDecodeView(root!, createDecode(seed), {
    seedLabel: seed,
    onNewPuzzle: () => {
      const next = deriveSeed(seed, 'next-puzzle').toString(36);
      history.pushState(null, '', `?seed=${next}`);
      start(next);
    },
  });
}

window.addEventListener('popstate', () => start(currentSeed()));
start(currentSeed());
