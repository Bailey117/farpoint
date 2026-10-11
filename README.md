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

Append `?seed=<anything>` to the URL to replay a specific puzzle.
