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
npm run balance    # playtest-bot balance report (slow; RUNS=N to change)
```

The run saves itself to localStorage after every action (key `farpoint.save.v1`),
including mid-puzzle and mid-expedition. Starting a run with the same seed gives
the same team, addresses, worlds and outcomes for the same choices.

Content (encounters, biomes, names) lives in `src/data/` as plain data.

## Balance

Balance values live in `RUN_CONFIG` (`src/game/run.ts`). They were tuned so that
a careful bot (weighs odds, treats wounds, decodes by exploring) wins about one
run in three over roughly 15 expeditions, and a careless bot (random choices)
does not survive long. Re-run `npm run balance` after changing content or values.

