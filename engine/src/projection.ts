import { Player, ProjectedPlayer } from './types.js';
import { ENGINE_CONFIG } from './config.js';

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

  // TODO NEEDS-VALIDATION: multi-GW projection blend (0.6*ppg + 0.4*form) was not
  // separately backtested. This is v1. Port §9 backtest harness to test alternative
  // blends against realized multi-GW points once historical data is loaded.
  const base = 0.6 * player.ppg + 0.4 * player.form;
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
