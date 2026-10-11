/**
 * Synthesized sound for the ring. No audio files: everything is built from
 * oscillators and filtered noise with the Web Audio API.
 *
 * A whole dial is scheduled up front from the same `DialPlan` the animation
 * samples, so sound and motion stay locked together on the audio clock.
 * Works with an OfflineAudioContext too (used to verify levels).
 *
 * Noise buffers come from the seeded game RNG so nothing here uses
 * Math.random.
 */

import type { Mark } from '../game/address';
import { Rng } from '../game/rng';
import { type DialPlan, GLYPH_STEP_DEG, sampleRing } from './ringTimeline';

const MIN = 0.0001;

/** Minor-ish ladder so each successive lock rings a little higher. */
const LOCK_STEPS = [0, 3, 5, 7, 10, 12, 15];

export interface Voice {
  /** Fade out and cut everything this voice scheduled. */
  stop(fadeSec?: number): void;
}

export class RingSound {
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly bus: GainNode;
  private readonly reverbSend: GainNode;
  private readonly noise: AudioBuffer;
  private enabled = true;

  constructor(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    this.ctx = ctx;
    const rng = new Rng('farpoint-sound');

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;

    const comp = ctx.createDynamicsCompressor();
    // Gentle, slow-attack compression: tames the finale without flattening strikes.
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.012;
    comp.release.value = 0.25;

    // Final safety limiter so the success boom never clips.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    comp.connect(this.master).connect(limiter).connect(destination);

    this.bus = ctx.createGain();
    this.bus.connect(comp);

    // Large stone hall: decaying stereo noise impulse.
    const convolver = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    convolver.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    // Keep sub-bass out of the reverb; it only muddies the next strike.
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 180;
    this.reverbSend.connect(verbHp).connect(convolver).connect(comp);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.02);
  }

  isEnabled() {
    return this.enabled;
  }

  // -------------------------------------------------------------------------
  // Building blocks. Each takes the voice output node and tracks sources.
  // -------------------------------------------------------------------------

  private newVoice(): { out: GainNode; sources: AudioScheduledSourceNode[]; voice: Voice } {
    const out = this.ctx.createGain();
    out.connect(this.bus);
    out.connect(this.reverbSend);
    const sources: AudioScheduledSourceNode[] = [];
    const voice: Voice = {
      stop: (fadeSec = 0.12) => {
        const now = this.ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + fadeSec);
        for (const s of sources) {
          try {
            s.stop(now + fadeSec + 0.02);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => out.disconnect(), (fadeSec + 0.1) * 1000);
      },
    };
    return { out, sources, voice };
  }

  private gain(dest: AudioNode | AudioParam, value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (dest instanceof AudioParam) g.connect(dest);
    else g.connect(dest);
    return g;
  }

  private filter(dest: AudioNode, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  private osc(
    dest: AudioNode,
    sources: AudioScheduledSourceNode[],
    type: OscillatorType,
    freq: number,
    start: number,
    stop: number,
  ): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    o.connect(dest);
    o.start(start);
    o.stop(stop);
    sources.push(o);
    return o;
  }

  private noiseSrc(
    dest: AudioNode,
    sources: AudioScheduledSourceNode[],
    start: number,
    stop: number,
    offset = 0,
  ): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.connect(dest);
    n.start(start, offset % 2);
    n.stop(stop);
    sources.push(n);
    return n;
  }

  /** Percussive envelope on a fresh gain node. */
  private hit(dest: AudioNode, t: number, peak: number, decay: number, attack = 0.004): GainNode {
    const g = this.gain(dest, 0);
    g.gain.setValueAtTime(MIN, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(MIN, t + attack + decay);
    return g;
  }

  /** Low pitched body blow: the felt weight of a strike. */
  private thud(out: AudioNode, src: AudioScheduledSourceNode[], t: number, peak: number, from = 120, to = 36, decay = 0.45) {
    const g = this.hit(out, t, peak, decay);
    const o = this.osc(g, src, 'sine', from, t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(to, t + decay * 0.5);
  }

  /** Short filtered noise burst: metal contact. */
  private clank(out: AudioNode, src: AudioScheduledSourceNode[], t: number, peak: number, type: BiquadFilterType, freq: number, decay: number, q = 0.8) {
    const g = this.hit(out, t, peak, decay, 0.002);
    this.noiseSrc(this.filter(g, type, freq, q), src, t, t + decay + 0.05, t * 7.3);
  }

  /** Inharmonic struck-metal ring. */
  private bell(out: AudioNode, src: AudioScheduledSourceNode[], t: number, base: number, peak: number, decay: number) {
    const partials: [number, number][] = [[1, 1], [2.32, 0.55], [4.25, 0.32], [6.63, 0.18]];
    for (const [ratio, amp] of partials) {
      const g = this.hit(out, t, peak * amp, decay / Math.sqrt(ratio), 0.003);
      this.osc(g, src, 'sine', base * ratio, t, t + decay + 0.1);
    }
  }

  // -------------------------------------------------------------------------
  // The dial sequence
  // -------------------------------------------------------------------------

  scheduleDial(plan: DialPlan, startAt: number = this.ctx.currentTime + 0.03): Voice {
    const { out, sources: src, voice } = this.newVoice();
    const T = (ms: number) => startAt + ms / 1000;
    const end = T(plan.totalMs);
    const tail = plan.success ? 3.5 : 1.0;
    const firstTurn = T(plan.steps[0]?.rotateStart ?? plan.finaleStart);

    // --- Power-up: relay clack, charge whine, sub hum swells in. ---
    this.clank(out, src, startAt, 0.25, 'highpass', 2200, 0.04);
    this.thud(out, src, startAt + 0.02, 0.35, 70, 40, 0.3);
    {
      const g = this.gain(out, 0);
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(0.07, firstTurn - 0.05);
      g.gain.linearRampToValueAtTime(0, firstTurn + 0.25);
      const f = this.filter(g, 'lowpass', 400, 2);
      f.frequency.setValueAtTime(400, startAt);
      f.frequency.exponentialRampToValueAtTime(1600, firstTurn);
      const o = this.osc(f, src, 'sawtooth', 55, startAt, firstTurn + 0.3);
      o.frequency.exponentialRampToValueAtTime(165, firstTurn);
    }

    // Background bed (hum, grind, rumble). It ducks under every strike so
    // the impacts land with real contrast.
    const bed = this.gain(out, 1);
    bed.gain.setValueAtTime(1, startAt);
    for (const step of plan.steps) {
      const t = T(step.impactAt);
      bed.gain.setValueAtTime(1, t - 0.005);
      bed.gain.linearRampToValueAtTime(0.25, t + 0.01);
      bed.gain.setTargetAtTime(1, t + 0.08, 0.12);
    }

    // Hum: the machine's presence for the whole dial.
    const hum = this.gain(bed, 0);
    hum.gain.setValueAtTime(0, startAt);
    hum.gain.linearRampToValueAtTime(0.1, firstTurn);
    const humFilter = this.filter(hum, 'lowpass', 300);
    const humOscs = ([[41, 'sine', 0.5], [82.4, 'sine', 0.45], [123.6, 'triangle', 0.3]] as const).map(([f, type, level]) =>
      this.osc(this.gain(humFilter, level), src, type, f, startAt, end + tail),
    );
    // Slow beating gives the hum a living throb.
    humOscs[1]!.detune.value = 6;

    // --- Rotation: grinding stone/metal + low rumble, driven by ring speed. ---
    const curveStep = 0.02;
    const speed = new Float32Array(Math.max(2, Math.ceil(plan.totalMs / (curveStep * 1000)) + 1));
    for (let i = 0; i < speed.length; i++) speed[i] = sampleRing(plan, i * curveStep * 1000).speed;
    const curveDur = (speed.length - 1) * curveStep;
    const scaled = (k: number, offset = 0) => speed.map((s) => offset + s * k);

    const grind = this.gain(bed, 0);
    grind.gain.setValueCurveAtTime(scaled(1.0), startAt, curveDur);
    const grindBand = this.filter(grind, 'bandpass', 250, 1.6);
    grindBand.frequency.setValueCurveAtTime(scaled(520, 160), startAt, curveDur);
    this.noiseSrc(grindBand, src, startAt, startAt + curveDur + 0.05);

    const rumble = this.gain(bed, 0);
    rumble.gain.setValueCurveAtTime(scaled(0.45), startAt, curveDur);
    const rumbleLp = this.filter(rumble, 'lowpass', 240, 1.2);
    const rumbleOsc = this.osc(rumbleLp, src, 'sawtooth', 34, startAt, startAt + curveDur + 0.05);
    rumbleOsc.frequency.setValueCurveAtTime(scaled(22, 30), startAt, curveDur);

    // Ratchet: a tick each time a glyph boundary passes the keystone.
    {
      let prev = Math.floor(plan.startAngle / GLYPH_STEP_DEG);
      for (let ms = 0; ms <= plan.finaleStart; ms += 4) {
        const f = sampleRing(plan, ms);
        const idx = Math.floor((f.angle + GLYPH_STEP_DEG / 2) / GLYPH_STEP_DEG);
        if (idx !== prev) {
          this.clank(out, src, T(ms), 0.45 + 0.5 * f.speed, 'bandpass', 1500, 0.035, 2);
          prev = idx;
        }
      }
    }

    // --- Each chevron. ---
    let locks = 0;
    for (const step of plan.steps) {
      const hitAt = T(step.impactAt);
      // Keystone drop: a short hydraulic push before the strike.
      if (step.impactAt > step.rotateEnd) this.clank(out, src, T(step.rotateEnd), 0.06, 'highpass', 1200, 0.1);
      this.impact(out, src, hitAt, step.mark, step.mark === 'locked' ? locks++ : locks);
      // Keystone lifts off.
      if (step.end > step.releaseStart) this.clank(out, src, T(step.releaseStart), 0.05, 'highpass', 2600, 0.14);
    }

    // --- Finale. ---
    const fStart = T(plan.finaleStart);
    if (plan.success) {
      this.successFinale(out, src, fStart, end, hum);
    } else {
      // Wind-down: hum sags in pitch and dies, last disengage clunk.
      hum.gain.setValueAtTime(0.1, fStart);
      hum.gain.linearRampToValueAtTime(0, end + 0.6);
      for (const o of humOscs) {
        o.detune.setValueAtTime(o.detune.value, fStart);
        o.detune.linearRampToValueAtTime(-1000, end + 0.6);
      }
      this.thud(out, src, fStart + 0.05, 0.5, 90, 30, 0.5);
      const g = this.hit(out, fStart, 0.09, 0.9, 0.01);
      const lp = this.filter(g, 'lowpass', 900);
      const o = this.osc(lp, src, 'sawtooth', 220, fStart, fStart + 1);
      o.frequency.exponentialRampToValueAtTime(38, fStart + 0.9);
    }
    return voice;
  }

  private impact(out: AudioNode, src: AudioScheduledSourceNode[], t: number, mark: Mark, lockIndex: number) {
    // Every strike lands hard.
    this.thud(out, src, t, mark === 'absent' ? 0.7 : 0.95, 130, 34, 0.32);
    this.clank(out, src, t, mark === 'absent' ? 0.25 : 0.5, 'lowpass', 1800, 0.07);

    if (mark === 'locked') {
      const base = 196 * Math.pow(2, (LOCK_STEPS[Math.min(lockIndex, LOCK_STEPS.length - 1)] ?? 0) / 12);
      this.bell(out, src, t + 0.005, base, 0.16, 1.6);
      this.thud(out, src, t + 0.06, 0.6, 70, 28, 0.42); // second, deeper seat
      this.clank(out, src, t + 0.02, 0.07, 'highpass', 3500, 0.35); // seal hiss
    } else if (mark === 'drifting') {
      // Catches, then scrapes free.
      const g = this.hit(out, t + 0.04, 0.3, 0.38, 0.01);
      const bp = this.filter(g, 'bandpass', 2600, 7);
      bp.frequency.setValueAtTime(2600, t + 0.04);
      bp.frequency.exponentialRampToValueAtTime(480, t + 0.42);
      this.noiseSrc(bp, src, t + 0.04, t + 0.5, t * 3.1);
      const g2 = this.hit(out, t, 0.06, 0.7);
      this.osc(g2, src, 'sine', 311, t, t + 0.8);
      this.osc(g2, src, 'sine', 317.5, t, t + 0.8);
    } else {
      // Fails to seat: power sags, contacts fizzle.
      const g = this.hit(out, t + 0.02, 0.13, 0.35, 0.01);
      const lp = this.filter(g, 'lowpass', 700);
      const o = this.osc(lp, src, 'sawtooth', 150, t + 0.02, t + 0.4);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.36);
      for (let i = 0; i < 4; i++) this.clank(out, src, t + 0.05 + i * 0.045, 0.06 / (i + 1), 'bandpass', 4200, 0.02, 2);
    }
  }

  private successFinale(out: AudioNode, src: AudioScheduledSourceNode[], start: number, end: number, hum: GainNode) {
    const dur = end - start;
    const burst = start + dur * 0.25;

    // Gather: rising roar and climbing sub until the burst.
    {
      const g = this.gain(out, 0);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.4, burst);
      g.gain.exponentialRampToValueAtTime(MIN, burst + 0.08);
      const lp = this.filter(g, 'lowpass', 300, 1.5);
      lp.frequency.setValueAtTime(300, start);
      lp.frequency.exponentialRampToValueAtTime(6000, burst);
      this.noiseSrc(lp, src, start, burst + 0.1);
    }
    {
      const g = this.gain(out, 0);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.35, burst);
      g.gain.exponentialRampToValueAtTime(MIN, burst + 0.1);
      const o = this.osc(g, src, 'sine', 30, start, burst + 0.15);
      o.frequency.exponentialRampToValueAtTime(70, burst);
      const lp = this.filter(g, 'lowpass', 800);
      for (const f of [110, 110 * 1.5]) {
        const s = this.osc(lp, src, 'sawtooth', f, start, burst + 0.15);
        s.frequency.exponentialRampToValueAtTime(f * 2, burst);
      }
    }
    hum.gain.setValueAtTime(0.1, start);
    hum.gain.linearRampToValueAtTime(0.2, burst);
    hum.gain.linearRampToValueAtTime(0.08, burst + 0.6);
    hum.gain.linearRampToValueAtTime(0, end + 3);

    // The burst: a deep boom and a blast of air.
    this.thud(out, src, burst, 1.0, 85, 24, 2.4);
    this.clank(out, src, burst, 0.7, 'lowpass', 2600, 1.4, 0.5);
    this.bell(out, src, burst + 0.01, 98, 0.18, 3.5);

    // The open veil: a warm, slowly breathing chord with a high shimmer.
    const chord = [73.4, 110, 146.8, 220, 277.2];
    const pad = this.gain(out, 0);
    pad.gain.setValueAtTime(0, burst);
    pad.gain.linearRampToValueAtTime(0.09, burst + 0.8);
    pad.gain.setValueAtTime(0.09, end);
    pad.gain.linearRampToValueAtTime(0, end + 3);
    const padLp = this.filter(pad, 'lowpass', 1400);
    chord.forEach((f, i) => {
      const o = this.osc(padLp, src, i % 2 ? 'triangle' : 'sine', f, burst, end + 3.1);
      o.detune.value = (i - 2) * 4;
    });
    const shimmer = this.gain(out, 0);
    shimmer.gain.setValueAtTime(0, burst);
    shimmer.gain.linearRampToValueAtTime(0.025, burst + 1.2);
    shimmer.gain.linearRampToValueAtTime(0, end + 2.5);
    const trem = this.gain(shimmer.gain, 0.012);
    this.osc(trem, src, 'sine', 5.5, burst, end + 2.6);
    this.osc(shimmer, src, 'sine', 1108.7, burst, end + 2.6);
    this.osc(shimmer, src, 'sine', 1661.2, burst, end + 2.6);
  }

  /** Condensed ending, used when the player skips the sequence. */
  scheduleSkipEnding(success: boolean, startAt: number = this.ctx.currentTime + 0.02): Voice {
    const { out, sources: src, voice } = this.newVoice();
    if (success) {
      this.thud(out, src, startAt, 1.0, 85, 24, 2.0);
      this.clank(out, src, startAt, 0.6, 'lowpass', 2600, 1.0, 0.5);
      this.bell(out, src, startAt + 0.01, 98, 0.18, 3);
    } else {
      this.thud(out, src, startAt, 0.85, 120, 32, 0.6);
      this.clank(out, src, startAt, 0.4, 'lowpass', 1800, 0.08);
    }
    return voice;
  }
}
