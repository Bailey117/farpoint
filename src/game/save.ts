/**
 * Save/load for the run. Storage is injected (localStorage in the browser,
 * a Map in tests). Loading validates the shape so a corrupt or outdated
 * save is reported rather than crashing the game.
 */

import type { RunState } from './run';

export const SAVE_KEY = 'farpoint.save.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; run: RunState }
  | { kind: 'corrupt'; reason: string };

export function serialize(run: RunState): string {
  return JSON.stringify(run);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural check of a parsed save. Returns a reason when invalid. */
export function checkRun(data: unknown): string | null {
  if (!isObj(data)) return 'not an object';
  if (data.version !== 1) return `unsupported version ${String(data.version)}`;
  for (const k of ['power', 'salvage', 'freeDials', 'nextId', 'rngState'] as const) if (!isNum(data[k])) return `bad ${k}`;
  if (typeof data.seed !== 'string') return 'bad seed';
  if (!['active', 'won', 'lost'].includes(data.status as string)) return 'bad status';
  if (!isObj(data.items) || !['reveal', 'eliminate', 'freeDial'].every((k) => isNum((data.items as Record<string, unknown>)[k]))) return 'bad items';
  for (const k of ['team', 'recruits', 'fallen', 'leads', 'worlds', 'journal'] as const) if (!Array.isArray(data[k])) return `bad ${k}`;
  for (const m of [...(data.team as unknown[]), ...(data.recruits as unknown[])]) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.name !== 'string' || !isObj(m.stats) || !isNum(m.wounds)) return 'bad member';
  }
  for (const l of data.leads as unknown[]) {
    if (!isObj(l) || typeof l.id !== 'string' || !Array.isArray(l.address) || !Array.isArray(l.facts) || !Array.isArray(l.attempts)) return 'bad lead';
  }
  if (!isObj(data.stats)) return 'bad stats';
  if (data.excursion !== null && !isObj(data.excursion)) return 'bad excursion';
  return null;
}

export function deserialize(text: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'corrupt', reason: 'not valid JSON' };
  }
  const problem = checkRun(data);
  return problem ? { kind: 'corrupt', reason: problem } : { kind: 'ok', run: data as RunState };
}

export function saveRun(storage: KeyValueStorage, run: RunState): boolean {
  try {
    storage.setItem(SAVE_KEY, serialize(run));
    return true;
  } catch {
    return false; // storage full or unavailable
  }
}

export function loadRun(storage: KeyValueStorage): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { kind: 'none' };
  }
  return text === null ? { kind: 'none' } : deserialize(text);
}

export function clearSave(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}
