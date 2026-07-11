# FPL Assistant

A Fantasy Premier League planning app that turns live FPL data into squad, transfer, captain, and chip recommendations.

## Features

- View a manager's current squad and gameweek status
- Compare players using projected points, form, price, and ownership
- Generate transfer recommendations within FPL budget and squad rules
- Pick an optimized starting XI, captain, and vice-captain
- Evaluate wildcard, free hit, bench boost, and triple captain opportunities
- Build an optimized 15-player squad with locked and excluded players

## Project structure

This repository is an npm workspace with three packages:

- `client` — React, Vite, Tailwind CSS, React Query, and Zustand frontend
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

## Scripts

```bash
npm run dev    # Start the client and server in development mode
npm run build  # Build the engine, server, and client
npm test       # Run the engine test suite
```

## API overview

- `GET /api/health` — API, gameweek, and cache status
- `GET /api/players` — projected player data with filtering and sorting
- `GET /api/team/:teamId` — a manager's published squad and season summary
- `GET /api/recommend/:teamId` — lineup, captain, transfer, and chip advice
- `POST /api/recommend/:teamId` — recommendations using an edited deadline squad
- `POST /api/optimize` — generate a squad within the supplied constraints

## Notes

- Recommendations are decision-support estimates, not guarantees of future points.
- A manager's latest published FPL team must be publicly accessible for team-specific recommendations.
