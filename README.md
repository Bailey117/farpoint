# Farpoint (working title)

Browser roguelike: command a team exploring worlds through an ancient ring-portal
network, unlocking each world by deducing its glyph address.

## Stack
Vite + TypeScript, DOM/SVG rendering, Vitest. No backend.

- `src/game/` – pure game logic (no DOM). All randomness goes through `src/game/rng.ts`.
- `src/ui/` – rendering and input only.
- `tests/` – Vitest unit tests.

## Scripts
```
npm install
npm run dev        # dev server
npm run typecheck
npm test
npm run build
```

URL parameters (temporary test screens until the base screen exists):

- `?screen=decode&seed=<anything>`: the decode puzzle and dialling ring
- `?screen=expedition&seed=<anything>`: an expedition on a generated world
  (`&power=N` overrides the starting power)

The same seed always gives the same puzzle, world and outcomes.

Content (encounters, biomes, names) lives in `src/data/` as plain data.
