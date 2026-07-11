export const ENGINE_CONFIG = {
  // ---- Prediction ----
  // Primary signal for the NEXT gameweek = FPL's own ep_next. Used as-is.
  // For gameweeks beyond next (GW+1..GW+4 in the horizon), see projection.ts

  // ---- Transfer planner (validated: 5-GW horizon, hits when justified) ----
  TRANSFER_HORIZON_GW: 5,
  HIT_COST_PTS: 4,
  FREE_TRANSFER_MIN_GAIN: 0.0,
  HIT_MIN_GAIN: 4.0,

  // ---- Captain (validated: just pick highest projected xP) ----
  // capPick = argmax(projectedXp). Premium-bias heuristic was tested, added nothing.

  // ---- Squad legality ----
  BUDGET: 100.0,
  SQUAD_SIZE: 15,
  SQUAD_QUOTA: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<string, number>,
  MAX_PER_CLUB: 3,
  FORMATION: { GK: 1, DEF: [3, 5], MID: [2, 5], FWD: [1, 3] },
  MIN_RESERVE_PER_SLOT: 4.0,

  // ---- Chip guardrails (validated: optimize the FLOOR, not the ceiling) ----
  WILDCARD: {
    MIN_GW: 9,
    DRIFT_WINDOW_GW: 3,
    MIN_SUSTAINED_DRIFT: 8.0,
  },
  FREE_HIT: {
    BLANK_OWNED_THRESHOLD: 3,
  },
  BENCH_BOOST: {
    DGW_PREFER_COUNT: 4,
    DGW_BONUS_WEIGHT: 6.0,
  },
  TRIPLE_CAPTAIN: {
    DGW_BONUS_WEIGHT: 4.0,
  },
} as const;
