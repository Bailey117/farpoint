/**
 * The portal: a segmented ring, an event surface that swirls when a
 * wormhole is incoming, and a shutter of heavy slats that drops across it.
 * The shutter is closed by default; light leaks between the slats while a
 * wormhole is held behind it.
 *
 * Purely visual: the app tells it what state to show.
 */

const NS = 'http://www.w3.org/2000/svg';
const SEGMENTS = 18;
const SLATS = 7;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...children);
  return e;
}

export type Flash = 'good' | 'bad' | null;

export class Portal {
  readonly root: HTMLDivElement;
  private readonly segments: SVGPathElement[] = [];
  private readonly slats: SVGGElement[] = [];
  private segTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'portal';
    const svg = el('svg', { viewBox: '-200 -200 400 400', class: 'portal-svg', role: 'img', 'aria-label': 'The portal and its shutter' });

    const defs = el('defs');
    defs.innerHTML = `
      <radialGradient id="sd-surface" r="0.5">
        <stop offset="0" stop-color="#e9fbff"/>
        <stop offset="0.35" stop-color="#7fe0e8"/>
        <stop offset="0.8" stop-color="#1b6f86"/>
        <stop offset="1" stop-color="#0b2733"/>
      </radialGradient>
      <radialGradient id="sd-idle" r="0.5">
        <stop offset="0" stop-color="#11181f"/>
        <stop offset="1" stop-color="#070a0e"/>
      </radialGradient>
      <linearGradient id="sd-slat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6b7480"/>
        <stop offset="0.45" stop-color="#4a525c"/>
        <stop offset="1" stop-color="#2c3238"/>
      </linearGradient>
      <filter id="sd-wobble"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7"><animate attributeName="baseFrequency" dur="6s" values="0.012;0.02;0.012" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="14"/></filter>
      <clipPath id="sd-aperture"><circle r="132"/></clipPath>`;
    svg.append(defs);

    // Frame: a heavy ring cut into segments that light in turn.
    svg.append(el('circle', { r: 178, class: 'frame-outer' }));
    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = ((i / SEGMENTS) * 360 + 1.5) * (Math.PI / 180);
      const a1 = (((i + 1) / SEGMENTS) * 360 - 1.5) * (Math.PI / 180);
      const [r0, r1] = [140, 168];
      const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
      const d = `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
      const seg = el('path', { d, class: 'segment' });
      this.segments.push(seg);
      svg.append(seg);
    }
    svg.append(el('circle', { r: 136, class: 'frame-inner' }));

    // Event surface (behind the shutter).
    const surface = el('g', { 'clip-path': 'url(#sd-aperture)' });
    surface.append(el('circle', { r: 132, fill: 'url(#sd-idle)' }));
    const active = el('g', { class: 'surface' });
    active.append(el('circle', { r: 132, fill: 'url(#sd-surface)', filter: 'url(#sd-wobble)' }));
    for (const [r, cls] of [[110, 'swirl s1'], [80, 'swirl s2'], [50, 'swirl s3']] as const) active.append(el('circle', { r, class: cls }));
    surface.append(active);

    // Shutter slats, top to bottom, with a little gap for light to leak through.
    const shutter = el('g', { class: 'shutter' });
    const h = 264 / SLATS;
    for (let i = 0; i < SLATS; i++) {
      const y = -132 + i * h;
      const g = el('g', { class: 'slat', style: `--i:${i}` });
      g.append(el('rect', { x: -140, y: y + 1.5, width: 280, height: h - 3, fill: 'url(#sd-slat)' }));
      g.append(el('line', { x1: -140, y1: y + h - 4, x2: 140, y2: y + h - 4, class: 'slat-edge' }));
      for (const x of [-100, -40, 40, 100]) g.append(el('circle', { cx: x, cy: y + h / 2, r: 2.5, class: 'rivet' }));
      this.slats.push(g);
      shutter.append(g);
    }
    surface.append(shutter);
    svg.append(surface);
    svg.append(el('circle', { r: 132, class: 'aperture-rim' }));
    svg.append(el('circle', { r: 190, class: 'flash-ring' }));
    this.root.append(svg);
  }

  /** A wormhole forming (true) or collapsing (false). */
  setIncoming(on: boolean, reducedMotion = false) {
    clearInterval(this.segTimer);
    this.root.classList.toggle('incoming', on);
    if (!on) {
      for (const s of this.segments) s.classList.remove('lit');
      return;
    }
    if (reducedMotion) {
      for (const s of this.segments) s.classList.add('lit');
      return;
    }
    let i = 0;
    this.segTimer = setInterval(() => {
      this.segments[i % SEGMENTS]!.classList.add('lit');
      i++;
      if (i >= SEGMENTS) clearInterval(this.segTimer);
    }, 40);
  }

  setShutter(open: boolean) {
    this.root.classList.toggle('open', open);
  }

  flash(kind: Flash) {
    this.root.classList.remove('flash-good', 'flash-bad', 'shake');
    void this.root.offsetWidth;
    if (kind === 'good') this.root.classList.add('flash-good');
    if (kind === 'bad') this.root.classList.add('flash-bad', 'shake');
  }

  /** Something hits the closed shutter from the far side. */
  impact() {
    this.root.classList.remove('impact');
    void this.root.offsetWidth;
    this.root.classList.add('impact');
  }
}
