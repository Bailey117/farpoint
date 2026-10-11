/**
 * Balance report (not part of `npm test`; run with `npm run balance`).
 * Plays many runs with honest bots and prints the key numbers.
 */
import { it } from 'vitest';
import { RUN_CONFIG } from '../src/game/run';
import { decoderDials, playRun, summarise } from './bots';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUNS = Number(env.RUNS ?? 200);

it('balance report', () => {
  const dec = (k: number, c: number, len = 6) => {
    const d = Array.from({ length: 300 }, (_, i) => decoderDials(`d${i}`, k, c, len)).sort((a, b) => a - b);
    return `median ${d[150]} p90 ${d[270]} max ${d[299]}`;
  };
  console.log('decoder dials, start lead (2 known, 3 clues):', dec(RUN_CONFIG.startLeadFragments.knownSlots, RUN_CONFIG.startLeadFragments.clues));
  console.log('decoder dials, new lead (1 known, 2 clues):  ', dec(RUN_CONFIG.newLeadFragments.knownSlots, RUN_CONFIG.newLeadFragments.clues));
  console.log('decoder dials, final (0 known, 4 clues, 7):   ', dec(0, 4, 7));
  for (const style of ['careful', 'careless'] as const) {
    const reports = Array.from({ length: RUNS }, (_, i) => playRun(`bal-${i}`, style));
    console.log(style, summarise(reports));
  }
}, 600_000);
