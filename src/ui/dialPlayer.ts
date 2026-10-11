/**
 * Plays a DialPlan on a RingView with synchronized sound. Skippable.
 */

import type { Mark } from '../game/address';
import type { GlyphId } from '../game/glyphs';
import { idleFrame, type RingView } from './ringView';
import { DEFAULT_TIMING, type DialPlan, REDUCED_TIMING, type RingFrame, buildDialPlan, sampleRing } from './ringTimeline';
import { RingSound, type Voice } from './sound';

const SOUND_PREF_KEY = 'farpoint.sound';

let sound: RingSound | null = null;
let soundOn = readSoundPref();

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isSoundOn(): boolean {
  return soundOn;
}

export function setSoundOn(on: boolean) {
  soundOn = on;
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
  sound?.setEnabled(on);
}

/** Lazily create the audio graph. Must be called from a user gesture. */
function liveSound(): RingSound | null {
  if (!soundOn) return null;
  try {
    if (!sound) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      sound = new RingSound(new Ctx());
    }
    const ctx = sound.ctx as AudioContext;
    if (ctx.state === 'suspended') void ctx.resume();
    return sound;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class DialPlayer {
  private angle = 0;
  private running: {
    plan: DialPlan;
    t0: number;
    voice: Voice | null;
    resolve: () => void;
    raf: number;
    onFrame?: (frame: RingFrame) => void;
  } | null = null;
  private lastPlan: DialPlan | null = null;

  constructor(private readonly ring: RingView) {}

  get isPlaying(): boolean {
    return this.running !== null;
  }

  /** `onFrame` receives every rendered frame, so other UI can stay in sync with the ring. */
  play(guess: readonly GlyphId[], marks: readonly Mark[], onFrame?: (frame: RingFrame) => void): Promise<void> {
    this.finish(false);
    const reduced = prefersReducedMotion();
    this.ring.reducedMotion = reduced;
    const plan = buildDialPlan(guess, marks, this.angle, reduced ? REDUCED_TIMING : DEFAULT_TIMING);
    const s = liveSound();
    const lead = 0.04;
    const voice = s ? s.scheduleDial(plan, s.ctx.currentTime + lead) : null;
    return new Promise((resolve) => {
      const t0 = performance.now() + lead * 1000;
      const tick = () => {
        if (!this.running) return;
        const t = performance.now() - t0;
        const frame = sampleRing(plan, t);
        this.ring.render(frame, performance.now());
        onFrame?.(frame);
        if (t >= plan.totalMs) {
          this.finish(false);
          return;
        }
        this.running.raf = requestAnimationFrame(tick);
      };
      this.running = { plan, t0, voice, resolve, raf: requestAnimationFrame(tick), onFrame };
    });
  }

  /** Jump to the end of the current sequence. */
  skip() {
    this.finish(true);
  }

  private finish(skipped: boolean) {
    const r = this.running;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    this.running = null;
    if (skipped && r.voice) {
      r.voice.stop(0.1);
      liveSound()?.scheduleSkipEnding(r.plan.success);
    }
    this.angle = r.plan.finalAngle;
    this.lastPlan = r.plan;
    const last = sampleRing(r.plan, r.plan.totalMs);
    this.ring.render(last, performance.now());
    r.onFrame?.(last);
    if (r.plan.success) this.idleVeil();
    r.resolve();
  }

  /** Keep the open veil shimmering after a successful dial. */
  private idleVeil() {
    const plan = this.lastPlan;
    if (!plan || this.ring.reducedMotion) return;
    const loop = () => {
      if (this.running || this.lastPlan !== plan) return;
      this.ring.render(sampleRing(plan, plan.totalMs), performance.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Return the ring to rest (e.g. for a new puzzle). Keeps its angle. */
  reset(slotCount: number) {
    this.finish(false);
    this.lastPlan = null;
    this.ring.setSlotCount(slotCount);
    this.ring.render(idleFrame(slotCount, this.angle), performance.now());
  }

  /** Stop any loops; used when the view is torn down. */
  dispose() {
    this.finish(false);
    this.lastPlan = null;
  }
}
