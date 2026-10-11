/**
 * Redialling a known address: the ring dials it chevron by chevron (every
 * glyph locks), then the player steps through.
 */

import type { GlyphId } from '../game/glyphs';
import { h } from './dom';
import { glyphSvg } from './glyphArt';
import { sharedRing } from './ringStage';

export function mountDialView(root: HTMLElement, title: string, address: readonly GlyphId[], onContinue: () => void): { dispose(): void } {
  const { view: ring, player } = sharedRing(address.length);
  player.reset(address.length);
  let done = false;

  const skip = () => {
    if (!done) player.skip();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!done && (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      skip();
    }
  };
  document.addEventListener('keydown', onKey);
  ring.el.onclick = skip;

  const status = h('p', { class: 'message', role: 'status' }, 'Dialling… (click the ring or press Space to skip)');
  const button = h('button', { class: 'primary', disabled: true, onclick: () => onContinue() }, 'Step through');
  const slots = h(
    'div',
    { class: 'slots', style: `grid-template-columns: repeat(${address.length}, minmax(0, 1fr))` },
    address.map((g, i) => h('div', { class: 'slot', title: `Slot ${i + 1}` }, h('span', { class: 'slot-num' }, String(i + 1)), glyphSvg(g))),
  );
  root.replaceChildren(h('main', { class: 'dial-screen' }, h('section', { class: 'stage panel' }, h('div', { class: 'stage-head' }, h('h2', {}, title)), ring.el, slots, h('div', { class: 'controls' }, button), status)));

  const slotEls = Array.from(slots.children) as HTMLElement[];
  void player
    .play(address, address.map(() => 'locked'), (frame) => {
      frame.chevrons.forEach((c, i) => {
        const el = slotEls[i];
        if (!el) return;
        el.classList.toggle('active', frame.activeSlot === i && (c.light === 'armed' || c.light === 'dark'));
        if ((c.light === 'locked' || c.light === 'energy') && !el.classList.contains('revealed')) el.classList.add('revealed', 'mark-locked', 'hit');
      });
    })
    .then(() => {
      done = true;
      status.textContent = 'The ring is open.';
      button.disabled = false;
      button.focus();
    });

  return {
    dispose() {
      document.removeEventListener('keydown', onKey);
      ring.el.onclick = null;
      player.dispose();
    },
  };
}
