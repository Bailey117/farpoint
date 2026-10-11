/** Parameter sweep (sim only): mutates RUN_CONFIG per variant and restores it. */
import { it } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters';
import { RUN_CONFIG } from '../src/game/run';
import { playRun, summarise } from './bots';

type Patch = Partial<{ payMult: number; dialCost: number; startPower: number; returnTrickle: number; genPower: number; healCost: number; recruitChance: number; finalChance: number; finalUnlock: number; returnCost: number; emergencyCost: number }>;

function apply(p: Patch) {
  const saved = JSON.parse(JSON.stringify(RUN_CONFIG));
  if (p.dialCost !== undefined) RUN_CONFIG.dialCost = p.dialCost;
  if (p.startPower !== undefined) RUN_CONFIG.startPower = p.startPower;
  if (p.returnTrickle !== undefined) RUN_CONFIG.returnTrickle = p.returnTrickle;
  if (p.genPower !== undefined) RUN_CONFIG.generator = { ...RUN_CONFIG.generator, power: p.genPower };
  if (p.healCost !== undefined) RUN_CONFIG.healCost = p.healCost;
  if (p.recruitChance !== undefined) RUN_CONFIG.recruitChance = p.recruitChance;
  if (p.finalChance !== undefined) RUN_CONFIG.finalFragment = { ...RUN_CONFIG.finalFragment, chance: p.finalChance };
  if (p.finalUnlock !== undefined) RUN_CONFIG.finalUnlockFacts = p.finalUnlock;
  if (p.returnCost !== undefined || p.emergencyCost !== undefined) {
    RUN_CONFIG.expedition = { ...RUN_CONFIG.expedition, returnCost: p.returnCost ?? RUN_CONFIG.expedition.returnCost, emergencyCost: p.emergencyCost ?? RUN_CONFIG.expedition.emergencyCost };
  }
  const costs = ENCOUNTERS.flatMap((e) => e.choices.map((c) => [c, c.powerCost] as const));
  if (p.payMult !== undefined) for (const [c, cost] of costs) if (cost) (c as { powerCost?: number }).powerCost = Math.round(cost * p.payMult);
  return () => {
    Object.assign(RUN_CONFIG, saved);
    for (const [c, cost] of costs) (c as { powerCost?: number }).powerCost = cost;
  };
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const VARIANTS: Record<string, Patch> = JSON.parse(env.VARIANTS ?? '{"current":{}}');
const N = Number(env.RUNS ?? 80);

it('sweep', () => {
  for (const [name, patch] of Object.entries(VARIANTS)) {
    const restore = apply(patch);
    const line: string[] = [name.padEnd(14)];
    for (const style of ['careful', 'careless'] as const) {
      const s = summarise(Array.from({ length: N }, (_, i) => playRun(`sw-${i}`, style)));
      line.push(`${style}: win ${s.winRate} exp ${s.expeditionsAvg} wonAt ${s.expeditionsWhenWonMedian} deaths ${s.deathsAvg} unlock ${s.finalUnlockedRate}@${s.finalUnlockedAtAvg} finalTries ${s.finalAttemptsAvg} ${s.endings}`);
    }
    console.log(line.join(' | '));
    restore();
  }
}, 900_000);
