# FPL Assistant

A Fantasy Premier League planning app that turns live FPL data into a weekly plan: transfers, lineup, captain and chips — plus a track record showing how its advice would have played out for your own team this season.

## Features

- **This week's plan** — roll, use free transfers or take a hit, with each option compared side by side and a one-click "apply to my draft"
- Free transfers, bank, selling prices and chip availability detected from your FPL history
- Best starting XI and captain for the squad *after* the recommended transfers, with a per-player breakdown of expected points
- **Track record** — the season replayed week by week: following the app vs your actual points, its suggestions on your real squad vs your own moves, and projection accuracy vs FPL's own expected points
- Chip timing for Wildcard, Free Hit, Bench Boost and Triple Captain
- Player explorer and a squad builder with locked and excluded players
- Light, dark or system theme, with subtle reveal animations (Motion) that respect "reduce motion"
- Your team ID is remembered across sessions: in the browser, and in a long-lived first-party cookie that survives Safari clearing site data after a week away. Open `/?team=<id>` to load it on any other device

## How recommendations are made

**Projections** (`engine/src/model.ts`) build every player's expected points from FPL's scoring rules: playing time, goals and assists (xG/xA), clean sheets and goals conceded (team xG for/against, adjusted for the opponent and home advantage), saves, bonus, defensive contributions and cards. Each rate is estimated from this season with recency weighting, shrunk towards last season's numbers and a price/position prior, and scaled by expected minutes. Injury news ("Expected back 07 Nov") is mapped to the right gameweek. Double gameweeks add fixtures; blanks score zero.

**Transfers** (`engine/src/transfers.ts`, `squad.ts`) value a squad the way FPL scores it — the best legal XI each week, the captain counted twice, the bench lightly — over the next five gameweeks. The planner finds the best plan for each number of transfers (including paired moves where one sale funds an upgrade) and picks between rolling, using free transfers or taking hits by weighing the projected gain against the value of a saved transfer and the hit cost. Gains are discounted because the top-rated move is usually optimistic, and more so in the first weeks of a season.

**Timing.** A recommendation for a gameweek only ever uses matches that had finished before that gameweek's deadline. The upcoming gameweek is chosen by deadline time (not FPL's `is_next` flag, which can lag), cached FPL data expires at the deadline, and the app drops a plan whose deadline passes while it is open. The track record rebuilds every past week under the same cutoff and shows the deadline each piece of advice was made before.

## How accurate is it?

All numbers are out-of-sample: every gameweek is projected using only data available before its deadline (`engine/backtest`).

| Next-GW projections vs actual points | 2023-24 | 2024-25 | 2025-26 | 2026-27 (GW2–8) |
| --- | --- | --- | --- | --- |
| Correlation — this model | **0.44** | **0.45** | **0.40** | **0.41** |
| Correlation — FPL's expected points | 0.29 | 0.31 | 0.27 | 0.28 |
| RMSE — this model / FPL | 2.66 / 3.04 | 2.55 / 2.90 | 2.70 / 3.08 | 2.68 / 3.24 |

Season simulations (10 managers per season from varied GW1 squads, following the advice every week, no chips):

| Points, GW2 to season end | 2023-24 | 2024-25 | 2025-26 | 2026-27 (GW2–8) |
| --- | --- | --- | --- | --- |
| This engine | **2,278** | **2,318** | **2,041** | **393** |
| Previous engine (FPL ep + PPG/form blend) | 1,759 | 1,827 | 1,727 | 331 |

FPL's live `ep_next` is exactly its 30-day `form` figure. Public datasets archive an `xP` column, but it is recorded *after* each gameweek and correlates 0.998 with form including that week's points — it leaks the result, so it must not be used to validate projections. The previous engine's backtest relied on it.

Re-run the backtests (downloads public historical data on first run):

```bash
npm run backtest:accuracy --workspace=engine
npm run backtest:simulate --workspace=engine -- 2024-25 --managers 10
```

Last season's per-player totals used as the early-season prior live in `server/src/priorData.ts`; regenerate them each summer with `npx tsx server/scripts/build-prior.ts <season>`.

## Project structure

This repository is an npm workspace with three packages:

- `client` — React 19, Vite, Tailwind CSS, React Query and Zustand, with stock [shadcn/ui](https://ui.shadcn.com) components (`base-nova` style, neutral black-and-white theme). Add components with `npx shadcn@latest add <name>` from `client/` rather than hand-building them
- `server` — Express API that fetches and normalizes public FPL data
- `engine` — TypeScript projection and optimization logic with Vitest tests

## Requirements

- Node.js 20 or newer
- npm

## Getting started

Install dependencies:

```bash
npm install
```

Start the API and frontend together:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development server proxies `/api` requests to the Express server on port `3001`.

The app uses public Fantasy Premier League endpoints, so no API key or environment configuration is required for local development.

## Deploying to Vercel

The repository includes `vercel.json` for a single Vercel project:

- Vite builds the static client to `client/dist`.
- `api/index.ts` exposes the Express API as one Node.js Function.
- `/api/*` routes go to Express and client-side routes fall back to `index.html`.

Import the repository in Vercel with the project root left at the repository root. No environment variables are required. The app is suitable for a personal, non-commercial Hobby deployment; its in-memory FPL cache is best-effort and resets on function cold starts.

## Scripts

```bash
npm run dev    # Start the client and server in development mode
npm run build  # Build the engine, server, and client
npm test       # Run the engine and server test suites
```

## API overview

- `GET /api/health` — API, gameweek, and cache status
- `GET /api/players` — projected player data with filtering and sorting
- `GET /api/team/:teamId` — a manager's squad, bank, selling prices, free transfers and chips
- `GET /api/recommend/:teamId` — transfer plan, lineup, captain and chip advice
- `POST /api/recommend/:teamId` — the same for an edited deadline draft (`allowHits` optional)
- `GET /api/track/:teamId` — the season replayed with the engine's advice
- `GET | PUT | DELETE /api/me` — the team ID remembered for this browser (cookie)
- `POST /api/optimize` — generate a squad within the supplied constraints

## Notes

- Recommendations are decision-support estimates, not guarantees of future points.
- A manager's latest published FPL team must be publicly accessible for team-specific recommendations.
