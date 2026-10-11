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

/**
 * A button that needs a second click to act, for destructive actions.
 * (Browser confirm() dialogs are unavailable in some embeds.)
 */
export function confirmButton(label: string, confirmLabel: string, onConfirm: () => void, className = ''): HTMLButtonElement {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const btn = h('button', { class: className }, label) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    if (armed) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    armed = true;
    btn.textContent = confirmLabel;
    btn.classList.add('armed');
    timer = setTimeout(() => {
      armed = false;
      btn.textContent = label;
      btn.classList.remove('armed');
    }, 4000);
  });
  return btn;
}
