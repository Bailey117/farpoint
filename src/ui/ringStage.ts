/** One ring per page, so its angle carries over between screens. */

import { DialPlayer } from './dialPlayer';
import { RingView } from './ringView';

let shared: { view: RingView; player: DialPlayer } | null = null;

export function sharedRing(slotCount: number): { view: RingView; player: DialPlayer } {
  if (!shared) {
    const view = new RingView(slotCount);
    shared = { view, player: new DialPlayer(view) };
  }
  return shared;
}
