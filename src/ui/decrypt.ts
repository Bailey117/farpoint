/**
 * "Decrypt" effect: a world's address glyphs flicker, then dissolve into
 * scrambled characters that lock into the world's name one by one.
 * Purely cosmetic; the scramble uses the seeded RNG so it is repeatable.
 */

import type { GlyphId } from '../game/glyphs';
import { Rng } from '../game/rng';
import { h } from './dom';
import { glyphSvg } from './glyphArt';

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=/<>0123456789';
const FLICKER_MS = 500;
const SETTLE_START_MS = 260;
const SETTLE_STEP_MS = 95;
const TICK_MS = 45;

/** The address as a row of small glyphs, standing in for an unknown name. */
export function addressGlyphs(address: readonly GlyphId[]): HTMLElement {
  return h('span', { class: 'name-glyphs', 'aria-hidden': 'true' }, address.map((g) => glyphSvg(g, 'glyph name-glyph')));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate `el` (currently showing the address glyphs) into `text`.
 * Returns a function that cancels and shows the final text at once.
 */
export function decryptInto(el: HTMLElement, text: string, seed: number, onDone?: () => void): () => void {
  const finish = () => {
    el.classList.remove('decrypting');
    el.replaceChildren(text);
    el.setAttribute('aria-label', text);
    onDone?.();
  };
  if (prefersReducedMotion()) {
    finish();
    return () => {};
  }
  const rng = new Rng(seed);
  el.classList.add('decrypting');
  el.setAttribute('aria-label', text);
  let raf = 0;
  let lastTick = -Infinity;
  let spans: HTMLSpanElement[] | null = null;
  const start = performance.now();

  const frame = (now: number) => {
    const t = now - start;
    if (t < FLICKER_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (!spans) {
      spans = [...text].map(() => h('span', { class: 'scramble' }, '·'));
      el.replaceChildren(...spans);
    }
    const settleT = t - FLICKER_MS - SETTLE_START_MS;
    const settled = Math.max(0, Math.floor(settleT / SETTLE_STEP_MS) + 1);
    const tick = now - lastTick >= TICK_MS;
    if (tick) lastTick = now;
    spans.forEach((span, i) => {
      if (i < settled) {
        if (span.textContent !== text[i]) {
          span.textContent = text[i]!;
          span.className = 'scramble locked';
        }
      } else if (tick) {
        span.textContent = text[i] === ' ' ? ' ' : SCRAMBLE[Math.floor(rng.next() * SCRAMBLE.length)]!;
      }
    });
    if (settled >= text.length) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    finish();
  };
}
