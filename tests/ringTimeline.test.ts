import { describe, expect, it } from 'vitest';
import type { Mark } from '../src/game/address';
import { GLYPH_IDS, type GlyphId } from '../src/game/glyphs';
import { Rng } from '../src/game/rng';
import {
  DEFAULT_TIMING,
  REDUCED_TIMING,
  angleForGlyph,
  buildDialPlan,
  heavyRotation,
  sampleRing,
  shortestDelta,
  speedCurve,
} from '../src/ui/ringTimeline';

const GUESS: GlyphId[] = ['cairn', 'vane', 'loom', 'tide', 'knot', 'seed'];
const FAIL: Mark[] = ['locked', 'drifting', 'absent', 'absent', 'locked', 'drifting'];
const WIN: Mark[] = Array(6).fill('locked');

const mod360 = (a: number) => ((a % 360) + 360) % 360;

describe('shortestDelta', () => {
  it('stays within (-180, 180] and lands on the target', () => {
    for (let from = -720; from <= 720; from += 37) {
      for (let to = -360; to <= 360; to += 15) {
        const d = shortestDelta(from, to);
        expect(d).toBeGreaterThan(-180);
        expect(d).toBeLessThanOrEqual(180);
        expect(mod360(from + d)).toBeCloseTo(mod360(to));
      }
    }
  });
});

describe('heavyRotation', () => {
  it('starts at 0, ends exactly at 1, winds back and overshoots slightly', () => {
    for (const deg of [15, 90, 180]) {
      expect(heavyRotation(0, deg)).toBeCloseTo(0);
      expect(heavyRotation(1, deg)).toBeCloseTo(1);
      const samples = Array.from({ length: 201 }, (_, i) => heavyRotation(i / 200, deg));
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      expect(min).toBeLessThan(0);
      expect(min * deg).toBeGreaterThanOrEqual(-3.01); // wind-back at most ~3 degrees
      expect(max).toBeGreaterThan(1);
      expect((max - 1) * deg).toBeLessThanOrEqual(2.51); // overshoot at most ~2.5 degrees
    }
  });
});

describe('buildDialPlan', () => {
  it('visits every slot in order and aligns each glyph under the keystone', () => {
    const plan = buildDialPlan(GUESS, FAIL, 0);
    expect(plan.steps.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const step of plan.steps) {
      expect(mod360(step.toAngle)).toBeCloseTo(mod360(angleForGlyph(step.glyph)));
      expect(Math.abs(step.toAngle - step.fromAngle)).toBeLessThanOrEqual(180);
    }
  });

  it('has a monotonic schedule ending at totalMs', () => {
    const plan = buildDialPlan(GUESS, FAIL, 33);
    let t = 0;
    for (const s of plan.steps) {
      for (const v of [s.rotateStart, s.rotateEnd, s.impactAt, s.releaseStart, s.end]) {
        expect(v).toBeGreaterThanOrEqual(t);
        t = v;
      }
    }
    expect(plan.finaleStart).toBe(t);
    expect(plan.totalMs).toBe(t + DEFAULT_TIMING.finaleFailMs);
    expect(plan.success).toBe(false);
  });

  it('gives a successful dial the long finale', () => {
    const plan = buildDialPlan(GUESS, WIN, 0);
    expect(plan.success).toBe(true);
    expect(plan.totalMs - plan.finaleStart).toBe(DEFAULT_TIMING.finaleSuccessMs);
  });

  it('keeps a typical failed dial around five seconds', () => {
    const rng = new Rng('timing');
    let total = 0;
    let max = 0;
    const n = 500;
    for (let i = 0; i < n; i++) {
      const guess = rng.sample(GLYPH_IDS, 6);
      const ms = buildDialPlan(guess, FAIL, rng.int(0, 23) * -15).totalMs;
      total += ms;
      max = Math.max(max, ms);
    }
    expect(total / n).toBeGreaterThan(4000);
    expect(total / n).toBeLessThan(5500);
    expect(max).toBeLessThan(6500);
  });

  it('reduced timing is near-instant', () => {
    const plan = buildDialPlan(GUESS, FAIL, 0, REDUCED_TIMING);
    expect(plan.totalMs).toBeLessThan(1000);
  });

  it('a glyph already under the keystone needs no rotation', () => {
    const plan = buildDialPlan(['cairn'], ['locked'], angleForGlyph('cairn'));
    expect(plan.steps[0]!.rotateEnd).toBe(plan.steps[0]!.rotateStart);
  });
});

describe('sampleRing', () => {
  it('starts dark and ends with every chevron showing its mark', () => {
    const plan = buildDialPlan(GUESS, FAIL, 0);
    const start = sampleRing(plan, 0);
    expect(start.chevrons.every((c) => c.light === 'dark')).toBe(true);
    expect(start.phase).toBe('powerup');
    expect(start.angle).toBe(0);
    const end = sampleRing(plan, plan.totalMs);
    expect(end.phase).toBe('done');
    expect(end.chevrons.map((c) => c.light)).toEqual(FAIL);
    expect(end.chevrons.map((c) => c.glyph)).toEqual(GUESS);
    expect(end.angle).toBeCloseTo(plan.finalAngle);
    expect(end.veil).toBe(0);
    expect(end.keystone).toBe(0);
  });

  it('reveals chevrons one at a time, only after impact', () => {
    const plan = buildDialPlan(GUESS, FAIL, 0);
    for (const step of plan.steps) {
      const before = sampleRing(plan, step.impactAt - 1);
      expect(before.chevrons[step.slot]!.light).toBe('armed');
      expect(before.chevrons.slice(step.slot + 1).every((c) => c.light === 'dark')).toBe(true);
      const after = sampleRing(plan, step.impactAt);
      expect(after.chevrons[step.slot]!.light).toBe(step.mark);
      expect(after.keystone).toBe(1);
      expect(after.keystoneMark).toBe(step.mark);
      expect(after.shake).toBeGreaterThan(0);
    }
  });

  it('opens the veil only on success', () => {
    const win = buildDialPlan(GUESS, WIN, 0);
    expect(sampleRing(win, win.totalMs).veil).toBeCloseTo(1);
    expect(sampleRing(win, win.finaleStart).veil).toBe(0);
    const fail = buildDialPlan(GUESS, FAIL, 0);
    for (let t = 0; t <= fail.totalMs; t += 50) expect(sampleRing(fail, t).veil).toBe(0);
  });

  it('only reports speed while rotating, and clamps time', () => {
    const plan = buildDialPlan(GUESS, FAIL, 0);
    const s = plan.steps[1]!;
    expect(sampleRing(plan, (s.rotateStart + s.rotateEnd) / 2).speed).toBeGreaterThan(0);
    expect(sampleRing(plan, s.impactAt + 1).speed).toBe(0);
    expect(sampleRing(plan, plan.totalMs + 5000)).toEqual(sampleRing(plan, plan.totalMs));
    const curve = speedCurve(plan, 20);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(0);
  });
});
