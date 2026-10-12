# Farpoint (working title)

Browser roguelike: command a team exploring worlds through an ancient ring-portal
network, unlocking each world by deducing its glyph address.

## Stack
Vite + TypeScript, DOM/SVG rendering, Vitest. No backend.

- `src/game/` – pure game logic (no DOM). All randomness goes through `src/game/rng.ts`.
- `src/ui/` – rendering and input only.
- `tests/` – Vitest unit tests.
- `sim/` – playtest bots and balance reports (`npm run balance`). The bots play
  through the public API without peeking at hidden answers.

## Scripts
```
npm install
npm run dev        # dev server
npm run typecheck
npm test
npm run build
npm run build:artifact   # single self-contained page at dist/farpoint.html
npm run balance    # playtest-bot balance report (slow; RUNS=N to change)
npm run sample     # print generated runs to read (SAMPLES=N, SAMPLE_SEED=x)
```

The run saves itself to localStorage after every action (key `farpoint.save.v1`),
including mid-puzzle and mid-expedition. Starting a run with the same seed gives
the same team, addresses, worlds and outcomes for the same choices.

Content (encounters, biomes, names) lives in `src/data/` as plain data.

## Procedural runs

Each run generates a setting (`src/game/setting.ts`): the builders of the ring
network (what they valued, how they ended) and four factions, one hostile
empire, one aloof major power and two minor groups, each with a standing
towards you from At war (-3) to Allied (+3).

Worlds (`src/game/world.ts`) are assembled from parts that belong to their
biome (`src/data/setting.ts`): a landmark, a season, wildlife, builder ruins and
perhaps a faction. Each part carries a danger value, and a world's hazard is 1
plus their sum, so the probe can say why a world is dangerous. A faction's
danger follows its current standing. Generation picks the hazard first and then
parts that add up to it, which keeps the difficulty curve the bots were tuned on.

Names come from per-biome and per-people sound sets. `src/data/nameBlocklist.ts`
removes every possible name that is a real word or name; regenerate it with
`node scripts/name-blocklist.mjs words.txt` after changing the sound sets.

## Balance

Balance values live in `RUN_CONFIG` (`src/game/run.ts`). They were tuned so that
a careful bot (weighs odds, treats wounds, decodes by exploring) wins about one
run in three over roughly 15 expeditions, and a careless bot (random choices)
does not survive long. Re-run `npm run balance` after changing content or values.

