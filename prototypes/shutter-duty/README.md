# Shutter Duty (working title)

Proof of concept. You are the ring attendant at Brackwater Annex: incoming
travellers send an ID code, and you have seconds to check it against the
day's paperwork and open or close the shutter.

All names, codes and lore are original.

```
npm run dev              # from this folder (uses the repo's node_modules)
npm run typecheck
npm test
npm run build:artifact   # one self-contained page: dist/shutter-duty.html
```

- `src/game/` pure logic: `rules.ts` (the rules as data), `reference.ts`
  (the day's roster, codes and bulletins), `arrivals.ts` (arrivals built to
  be valid or to break exactly one rule, checked by the engine), `shift.ts`,
  `campaign.ts` (progress, lost teams, endless best; saved to localStorage).
- `src/ui/` rendering, the clock, keyboard (O / C) and sound cues.
- All randomness goes through `src/game/rng.ts`; a shift replays from its seed.

Rule definitions where the brief left room:
- Day 5: each transmission carries a separate authentication digit; a
  bulletin names the duress digit.
- Day 6: a forgery is one character off a listed code. A code with nothing
  close on the list falls under the day 1 rule instead, so the two never
  overlap. Listed codes are kept at least 3 characters apart.
- Day 7: recall and cancellation bulletins for a team; the latest time wins.
