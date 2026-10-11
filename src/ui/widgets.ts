import { h } from './dom';

export function powerMeter(power: number, max: number): HTMLElement {
  const pct = Math.max(0, Math.min(100, (power / Math.max(1, max)) * 100));
  return h(
    'div',
    { class: 'power', title: `Power reserve: ${power}` },
    h('span', {}, 'Power'),
    h('div', { class: 'power-bar' }, h('div', { class: 'power-fill', style: `width:${pct}%` })),
    h('span', { class: 'power-num' }, String(power)),
  );
}
