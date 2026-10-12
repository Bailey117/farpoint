/**
 * First-run field guide: one short card per screen, shown the first time a
 * player reaches it and on demand from the top bar. Which cards have been
 * seen is a per-browser convenience kept in localStorage (guarded).
 */

import { h } from './dom';

export type GuideKey = 'base' | 'decode' | 'expedition';

const SEEN_KEY = 'farpoint.guide.seen';

const GUIDES: Record<GuideKey, { title: string; points: string[] }> = {
  base: {
    title: 'Your base',
    points: [
      'Decode a partial address to open the ring on a new world, then send your team through.',
      'Expeditions bring back salvage, puzzle aids and address fragments. Fragments add clues to your addresses.',
      'Power pays for every dial. Convert salvage at the generator when you run low; the run ends if the ring can never be dialled again.',
      'The final address needs 6 clues before you can try it. Reach the Farpoint and get home to win.',
    ],
  },
  decode: {
    title: 'Decoding an address',
    points: [
      'Fill every slot and dial. Each glyph comes back green (right slot), amber (in the address, wrong slot) or grey (not in it). Every dial costs power.',
      'Every address uses one glyph from each of the six families, in any order. Once you find a family\'s glyph, the rest of that family is ruled out.',
      'Pick a slot to see which glyphs could still go there. Solved slots can hold untested glyphs: you learn more from each dial.',
    ],
  },
  expedition: {
    title: 'Expeditions',
    points: [
      'Probe a new world first (5 power) to learn its name, hazard and one hint, or step straight through.',
      'For each choice, pick who attempts it. The percentage is their chance of success.',
      'Failures wound. Three wounds kill, and the dead stay dead. On hazard 3+ worlds, failures wound one step more.',
      'Dialling home at the end is free. Leaving early with an emergency dial-out costs 15 power.',
    ],
  },
};

function readSeen(): Set<GuideKey> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as GuideKey[]);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<GuideKey>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: the guide may show again next time */
  }
}

export function hasSeenGuide(key: GuideKey): boolean {
  return readSeen().has(key);
}

export function markGuideSeen(key: GuideKey) {
  const seen = readSeen();
  seen.add(key);
  writeSeen(seen);
}

export function guideCard(key: GuideKey, onClose: () => void): HTMLElement {
  const g = GUIDES[key];
  return h(
    'aside',
    { class: 'guide', 'aria-label': `Guide: ${g.title}` },
    h('div', { class: 'guide-head' }, h('strong', {}, g.title), h('button', { class: 'small', onclick: onClose }, 'Got it')),
    h('ul', {}, g.points.map((p) => h('li', {}, p))),
  );
}
