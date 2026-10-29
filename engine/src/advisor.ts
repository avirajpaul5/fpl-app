import type { ProjectedPlayer, TransferPlan, XI } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { bestXI } from './squad.js';
import { planTransfers, freeTransfersAfter, type TransferOpts } from './transfers.js';
import type { Advice, AdvisorState } from './replay.js';

export interface WeekPlan {
  plan: TransferPlan;
  /** Best XI and captain for the squad after the recommended transfers. */
  xi: XI;
  advice: Advice;
}

/** Transfers, then lineup and captain for the resulting squad. */
export function adviseWeek(
  all: ProjectedPlayer[],
  state: AdvisorState,
  opts: TransferOpts = {}
): WeekPlan {
  const byId = new Map(all.map((p) => [p.id, p]));
  const squad = state.squad.map((id) => byId.get(id) ?? unknownPlayer(id, all[0]?.projByGw.length ?? 1));
  const plan = planTransfers({ players: squad }, all, state.freeTransfers, {
    bank: state.bank,
    sellingPrices: state.sellingPrices,
    gameweek: state.gw,
    ...opts,
  });
  let after = squad;
  for (const m of plan.moves) after = after.map((p) => (p.id === m.out.id ? m.in : p));
  const xi = bestXI({ players: after });
  return {
    plan,
    xi,
    advice: {
      transfers: plan.moves.map((m) => ({ out: m.out.id, in: m.in.id })),
      starters: xi.starters.map((p) => p.id),
      bench: xi.bench.map((p) => p.id),
      captain: xi.captain.id,
      vice: xi.viceCaptain.id,
      reason: plan.reason,
    },
  };
}

// A squad player missing from the projection pool (e.g. left the league).
function unknownPlayer(id: number, horizon: number): ProjectedPlayer {
  return {
    id, name: `#${id}`, pos: 'MID', team: 0, teamName: '', price: 0, epNext: 0, ppg: 0, form: 0,
    expectedGoals: 0, expectedAssists: 0, minutes: 0, ownership: 0, status: 'u', chanceNext: 0,
    totalPoints: 0, upcoming: [], projByGw: new Array(horizon).fill(0), projHorizon: 0,
  };
}

export interface ManagerWeek {
  gw: number;
  transfers: number;
  chip: string | null;
}

/**
 * Free transfers available at the `gw` deadline. One accrues after GW1, unused
 * ones roll (max 5), and Wildcard/Free Hit weeks keep the count unchanged.
 */
export function inferFreeTransfers(weeks: ManagerWeek[], gw: number, startedGw = 1): number {
  let ft = 1;
  const byGw = new Map(weeks.map((w) => [w.gw, w]));
  for (let g = Math.max(2, startedGw + 1); g < gw; g++) {
    const w = byGw.get(g);
    if (!w) continue;
    if (w.chip === 'wildcard' || w.chip === 'freehit') continue;
    ft = freeTransfersAfter(ft, w.transfers);
  }
  return Math.min(ENGINE_CONFIG.MAX_FREE_TRANSFERS, ft);
}
