export const ENGINE_CONFIG = {
  // ---- Prediction ----
  // Every gameweek is projected by the expected-points model in model.ts.

  // ---- Transfer planner (tuned by season simulation, see engine/backtest) ----
  TRANSFER_HORIZON_GW: 5,
  // Weight of GW+k is HORIZON_DISCOUNT^k: later projections are less certain.
  HORIZON_DISCOUNT: 0.85,
  // Bench points only count through auto-subs.
  BENCH_WEIGHT: 0.1,
  HIT_COST_PTS: 4,
  // Projected gains are optimistic (the best of many noisy candidates), so
  // decisions use only this share of them.
  GAIN_SHRINK: 0.75,
  // Gains are trusted less in the first weeks of a season (see earlySeasonTrust).
  EARLY_SEASON_GWS: 8,
  // Option value of keeping a free transfer for later weeks.
  FREE_TRANSFER_VALUE: 1.5,
  // Minimum score (after shrink, hits and FT value) before acting at all.
  MIN_ACTION_SCORE: 0.5,
  MAX_FREE_TRANSFERS: 5,
  MAX_MOVES_PER_GW: 4,

  // ---- Captain: highest next-GW projection ----

  // ---- Squad legality ----
  BUDGET: 100.0,
  SQUAD_SIZE: 15,
  SQUAD_QUOTA: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<string, number>,
  MAX_PER_CLUB: 3,
  FORMATION: { GK: 1, DEF: [3, 5], MID: [2, 5], FWD: [1, 3] },

  // ---- Chip guardrails: recommend "play now" only when this week is the best
  // in sight AND the projected value clears a conservative bar.
  WILDCARD: {
    // Discounted points over 8 GWs beyond what free transfers achieve.
    MIN_GAIN: 15,
  },
  FREE_HIT: {
    // One-week points over your own best XI.
    MIN_GAIN: 12,
  },
  BENCH_BOOST: {
    MIN_BENCH_PTS: 12,
  },
  TRIPLE_CAPTAIN: {
    MIN_CAPTAIN_PTS: 9,
  },
  // FPL chips refresh at GW20; first-half chips expire after GW19.
  CHIP_WINDOW_ENDS: [19, 38],
} as const;
