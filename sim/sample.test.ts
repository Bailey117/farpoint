/**
 * Prints sample runs (setting and worlds) so generated text can be read and
 * judged by a person. `npm run sample` (SAMPLES=N for more runs).
 */
import { it } from 'vitest';
import { BIOME_INFO } from '../src/data/biomes';
import { newRun } from '../src/game/run';
import { buildersText, factionBlurb, standingLabel } from '../src/game/setting';
import { HAZARD_LABEL, describeWorld, generateWorldProfile, hazardCauses, worldHazard } from '../src/game/world';

const proc = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
const env = proc?.env ?? {};
const RUNS = Number(env.SAMPLES ?? 3);
const WORLDS = 6;

it('prints sample runs', () => {
  const out: string[] = [];
  for (let r = 0; r < RUNS; r++) {
    const run = newRun(`sample-${env.SAMPLE_SEED ?? ''}${r}`);
    const s = run.setting;
    out.push(`=== Run "${run.seed}" ===`, buildersText(s.builders), '');
    for (const f of s.factions) out.push(`* ${f.name} [${f.tier}, ${standingLabel(f.standing)}; ${f.biomes.join(', ')}]: ${factionBlurb(f, s)}`);
    out.push('');
    const taken = new Set<string>();
    for (let w = 0; w < WORLDS; w++) {
      const p = generateWorldProfile(`${run.seed}-w${w}`, s, { taken });
      taken.add(p.name);
      const hz = worldHazard(p, s);
      const causes = hazardCauses(p, s).map((c) => c.label);
      out.push(`${p.name} - ${BIOME_INFO[p.biome].name}, hazard ${hz} (${HAZARD_LABEL[hz]})${causes.length ? `: ${causes.join(', ')}` : ''}`);
      out.push(`  ${describeWorld(p, s).join(' ')}`, '');
    }
  }
  proc?.stdout.write(`${out.join('\n')}\n`);
});
