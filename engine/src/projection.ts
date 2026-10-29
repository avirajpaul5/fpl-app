import { Player, ProjectedPlayer } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { projectAll, type ModelInput, type PlayerProjection } from './model.js';

/** Combine display data with model projections; players the model has not seen project 0. */
export function attachProjections(
  players: Player[],
  projections: Map<number, PlayerProjection>,
  horizon: number = ENGINE_CONFIG.TRANSFER_HORIZON_GW
): ProjectedPlayer[] {
  return players.map((p) => {
    const proj = projections.get(p.id);
    const projByGw = proj ? proj.byGw.slice() : new Array<number>(horizon).fill(0);
    const window = projByGw.slice(0, ENGINE_CONFIG.TRANSFER_HORIZON_GW);
    return {
      ...p,
      projByGw,
      projHorizon: window.reduce((s, v) => s + v, 0),
      xMins: proj?.xMinsByGw[0] ?? 0,
      pStart: proj?.pStart ?? 0,
      breakdown: proj?.next,
    };
  });
}

export function projectPlayers(players: Player[], input: ModelInput): ProjectedPlayer[] {
  return attachProjections(players, projectAll(input), input.horizon);
}
