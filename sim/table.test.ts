import { it } from 'vitest';
import { decoderDials } from './bots';

it('dials by fragment spec', () => {
  const rows: string[] = [];
  for (const [k, c, len] of [[2, 3, 6], [2, 5, 6], [3, 3, 6], [3, 5, 6], [4, 3, 6], [1, 4, 6], [0, 4, 7], [1, 6, 7], [2, 6, 7]] as const) {
    for (const style of ['careful', 'careless'] as const) {
      const d = Array.from({ length: 400 }, (_, i) => decoderDials(`t${i}`, k, c, len, style)).sort((a, b) => a - b);
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      rows.push(`${style.padEnd(8)} len ${len} known ${k} clues ${c}: mean ${mean.toFixed(1)} median ${d[200]} p90 ${d[360]}`);
    }
  }
  console.log(rows.join('\n'));
});
