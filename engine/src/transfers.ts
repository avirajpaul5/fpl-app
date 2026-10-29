import { ProjectedPlayer, Squad, TransferMove, TransferOption, TransferPlan } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { bestMoveSets, squadValue, type MoveSet, type SquadValueOptions } from './squad.js';

export interface TransferOpts extends SquadValueOptions {
  bank?: number;
  sellingPrices?: Record<number, number>;
  maxMoves?: number;
  gainShrink?: number;
  freeTransferValue?: number;
  minActionScore?: number;
  candidatesPerPos?: number;
  /** When false, never plan more moves than there are free transfers. */
  allowHits?: boolean;
  /** Upcoming GW; early-season projections rest on few matches, so gains are trusted less. */
  gameweek?: number;
  earlySeasonGws?: number;
}

/** Share of a projected gain trusted at this point of the season (0.5 at GW1 → 1 after the early window). */
export function earlySeasonTrust(gameweek: number | undefined, window: number = ENGINE_CONFIG.EARLY_SEASON_GWS): number {
  if (gameweek == null || window <= 0) return 1;
  return 0.5 + 0.5 * Math.min(1, Math.max(0, gameweek - 1) / window);
}

/** Free transfers carried into next GW after making n transfers now. */
export function freeTransfersAfter(freeTransfers: number, n: number): number {
  return Math.min(ENGINE_CONFIG.MAX_FREE_TRANSFERS, Math.max(0, freeTransfers - n) + 1);
}

const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

export function planTransfers(
  squad: Squad,
  allPlayers: ProjectedPlayer[],
  freeTransfers: number,
  opts: TransferOpts = {}
): TransferPlan {
  const players = squad.players;
  const bank = opts.bank ?? Math.max(0, ENGINE_CONFIG.BUDGET - players.reduce((s, p) => s + p.price, 0));
  const sellingPrices = opts.sellingPrices ?? {};
  const maxMoves = opts.maxMoves ??
    Math.min(ENGINE_CONFIG.MAX_MOVES_PER_GW, opts.allowHits === false ? freeTransfers : freeTransfers + 1);
  const shrink = (opts.gainShrink ?? ENGINE_CONFIG.GAIN_SHRINK) * earlySeasonTrust(opts.gameweek, opts.earlySeasonGws);
  const ftValue = opts.freeTransferValue ?? ENGINE_CONFIG.FREE_TRANSFER_VALUE;
  const minScore = opts.minActionScore ?? ENGINE_CONFIG.MIN_ACTION_SCORE;
  const valueOpts: SquadValueOptions = { horizon: opts.horizon, discount: opts.discount, benchWeight: opts.benchWeight };

  const sets = bestMoveSets(players, allPlayers, {
    ...valueOpts,
    bank,
    sellingPrices,
    maxMoves,
    candidatesPerPos: opts.candidatesPerPos,
  });

  const rollCarry = freeTransfersAfter(freeTransfers, 0);
  const options: TransferOption[] = [];
  const setsByN = new Map<number, MoveSet>();
  for (let n = 0; n < sets.length; n++) {
    const set = sets[n];
    if (!set) continue;
    const hits = Math.max(0, n - freeTransfers);
    // Spending a free transfer forfeits its carry-over — worth nothing at the cap.
    const ftCost = ftValue * (rollCarry - freeTransfersAfter(freeTransfers, n));
    const score = n === 0 ? 0 : shrink * set.gain - ENGINE_CONFIG.HIT_COST_PTS * hits - ftCost;
    setsByN.set(n, set);
    options.push({
      transfers: n,
      hits,
      moves: toMoves(set, players, sellingPrices, valueOpts, freeTransfers),
      gain: set.gain,
      score,
      bankAfter: set.bankAfter,
    });
  }

  const best = options.reduce((a, b) => (b.score > a.score ? b : a), options[0]!);
  const chosen = best.transfers > 0 && best.score >= minScore ? best : options[0]!;
  const recommendation: TransferPlan['recommendation'] =
    chosen.transfers === 0 ? 'bank' : chosen.hits > 0 ? 'hit' : 'transfer';

  return {
    moves: chosen.moves,
    hitsTaken: chosen.hits,
    projNetGain: chosen.gain - ENGINE_CONFIG.HIT_COST_PTS * chosen.hits,
    recommendation,
    reason: explain(chosen, options, freeTransfers, opts.horizon ?? ENGINE_CONFIG.TRANSFER_HORIZON_GW),
    options,
    freeTransfers,
    freeTransfersNext: freeTransfersAfter(freeTransfers, chosen.transfers),
  };
}

function toMoves(
  set: MoveSet,
  squad: ProjectedPlayer[],
  sellingPrices: Record<number, number>,
  valueOpts: SquadValueOptions,
  freeTransfers: number
): TransferMove[] {
  if (set.outs.length === 0) return [];
  // Attribute the combined gain to each move in proportion to its standalone gain.
  const base = squadValue(squad, valueOpts);
  const standalone = set.outs.map((out, i) => {
    const swapped = squad.map((p) => (p.id === out.id ? set.ins[i]! : p));
    return Math.max(0, squadValue(swapped, valueOpts) - base);
  });
  const total = standalone.reduce((s, v) => s + v, 0);
  return set.outs.map((out, i) => {
    const gain = total > 0 ? (set.gain * standalone[i]!) / total : set.gain / set.outs.length;
    const tookHit = i >= freeTransfers;
    return {
      out,
      in: set.ins[i]!,
      outSellingPrice: sellingPrices[out.id] ?? out.price,
      gain,
      tookHit,
      netGain: gain - (tookHit ? ENGINE_CONFIG.HIT_COST_PTS : 0),
    };
  });
}

function explain(chosen: TransferOption, options: TransferOption[], freeTransfers: number, horizon: number): string {
  const ftNext = freeTransfersAfter(freeTransfers, chosen.transfers);
  const window = `the next ${horizon} GWs`;
  if (chosen.transfers === 0) {
    const bestMove = options.filter((o) => o.transfers > 0).sort((a, b) => b.gain - a.gain)[0];
    if (!bestMove) return `No legal improvement found. Roll the transfer — you'll have ${ftNext} next week.`;
    const capped = freeTransfers >= ENGINE_CONFIG.MAX_FREE_TRANSFERS;
    return capped
      ? `Even the best option only adds ${fmt(bestMove.gain)} pts over ${window}. You're at the ${ENGINE_CONFIG.MAX_FREE_TRANSFERS}-transfer cap, so a free move costs nothing — but none is worth making.`
      : `The best move adds only ${fmt(bestMove.gain)} pts over ${window}, which isn't enough to beat saving the transfer. Roll it — you'll have ${ftNext} free transfers next week.`;
  }
  const what = chosen.transfers === 1 ? 'This move adds' : `These ${chosen.transfers} moves add`;
  const hit = chosen.hits > 0 ? `, or ${fmt(chosen.gain - chosen.hits * ENGINE_CONFIG.HIT_COST_PTS)} after the −${chosen.hits * ENGINE_CONFIG.HIT_COST_PTS} hit` : '';
  return `${what} a projected ${fmt(chosen.gain)} pts over ${window}${hit}. You'll carry ${ftNext} free transfer${ftNext === 1 ? '' : 's'} into next week.`;
}
