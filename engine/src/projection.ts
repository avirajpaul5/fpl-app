import { Player, ProjectedPlayer } from './types.js';
import { ENGINE_CONFIG } from './config.js';

export interface MultiGwBlend {
  ppg: number;
  form: number;
  expectedAttack: number;
}

export type MultiGwSignals = Pick<
  Player,
  'pos' | 'ppg' | 'form' | 'expectedGoals' | 'expectedAssists' | 'minutes'
>;

export const MULTI_GW_BASELINE_BLEND: Readonly<MultiGwBlend> = {
  ppg: 0.6,
  form: 0.4,
  expectedAttack: 0,
};

// This blend beat the baseline in the 2022-23, 2023-24, and 2024-25
// historical GW+1..GW+4 backtests. Keep the baseline exported so future
// candidates can be compared on exactly the same harness.
export const MULTI_GW_BLEND: Readonly<MultiGwBlend> = {
  ppg: 0.6,
  form: 0.2,
  expectedAttack: 0.2,
};

const MIN_EXPECTED_RATE_MINUTES = 450;

function goalPoints(pos: Player['pos']): number {
  if (pos === 'MID') return 5;
  if (pos === 'FWD') return 4;
  return 6;
}

export function expectedAttackingPointsRate(player: MultiGwSignals): number {
  // Preserve the old PPG/form projection when expected-stat history is not yet
  // available (for example before the season starts).
  if (player.minutes <= 0) return player.form;

  const expectedPoints =
    player.expectedGoals * goalPoints(player.pos) + player.expectedAssists * 3;

  // Use a five-match denominator until the player has 450 minutes so a tiny
  // early-season sample cannot dominate the multi-GW projection.
  return (expectedPoints * 90) / Math.max(player.minutes, MIN_EXPECTED_RATE_MINUTES);
}

export function multiGwBasePoints(
  player: MultiGwSignals,
  blend: Readonly<MultiGwBlend> = MULTI_GW_BLEND
): number {
  return (
    blend.ppg * player.ppg +
    blend.form * player.form +
    blend.expectedAttack * expectedAttackingPointsRate(player)
  );
}

function availabilityMultiplier(p: Player): number {
  if (p.status === 'a') return 1.0;
  if (p.chanceNext != null) return p.chanceNext / 100;
  if (p.status === 'i' || p.status === 's' || p.status === 'u') return 0.0;
  if (p.status === 'd') return 0.5;
  return 1.0;
}

function projForGw(player: Player, k: number): number {
  if (k === 0) {
    // Primary signal: FPL's own ep_next. Use as-is.
    return player.epNext * availabilityMultiplier(player);
  }

  const base = multiGwBasePoints(player);
  const fixture = player.upcoming[k];

  if (!fixture) {
    // No fixture data — use base with neutral multipliers, halved for uncertainty
    return base * 0.5 * availabilityMultiplier(player);
  }

  const fdr = fixture.fdr ?? 3;
  // FDR1≈1.25 .. FDR5≈0.81 (validated shape)
  const fdrMult = 1.25 - (fdr - 1) * 0.11;
  const home = fixture.isHome ? 1.05 : 0.97;
  const dgw = fixture.isDGW ? 2.0 : 1.0; // a DGW ≈ two matches
  const avail = availabilityMultiplier(player);

  return base * fdrMult * home * dgw * avail;
}

export function projectPlayer(
  player: Player,
  horizon: number = ENGINE_CONFIG.TRANSFER_HORIZON_GW
): ProjectedPlayer {
  const projByGw: number[] = [];
  for (let k = 0; k < horizon; k++) {
    projByGw.push(projForGw(player, k));
  }
  const projHorizon = projByGw.reduce((sum, v) => sum + v, 0);
  return { ...player, projByGw, projHorizon };
}

export function projectPlayers(
  players: Player[],
  horizon: number = ENGINE_CONFIG.TRANSFER_HORIZON_GW
): ProjectedPlayer[] {
  return players.map((p) => projectPlayer(p, horizon));
}
