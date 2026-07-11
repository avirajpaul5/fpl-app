import { Player, ProjectedPlayer, Squad, TransferPlan, TransferMove } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { projectPlayer } from './projection.js';

interface TransferOpts {
  maxMoves?: number;
  bank?: number;
  sellingPrices?: Record<number, number>;
}

export function planTransfers(
  squad: Squad,
  allPlayers: ProjectedPlayer[],
  freeTransfers: number,
  opts: TransferOpts = {}
): TransferPlan {
  const maxMoves = opts.maxMoves ?? Math.min(freeTransfers + 1, 2);
  const moves: TransferMove[] = [];
  let hitsTaken = 0;

  // Clone the squad player list for mutation tracking
  let workingPlayers = [...squad.players] as Player[];
  const bank = opts.bank ?? Math.max(
    0,
    ENGINE_CONFIG.BUDGET - workingPlayers.reduce((s, p) => s + p.price, 0)
  );

  // Build a lookup for already-owned ids
  const ownedIds = new Set(workingPlayers.map((p) => p.id));

  // Build club counts from working squad
  const clubCount: Record<number, number> = {};
  for (const p of workingPlayers) {
    clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
  }

  // Index projected players by id
  const projMap = new Map<number, ProjectedPlayer>();
  for (const p of allPlayers) projMap.set(p.id, p);

  let currentBank = bank;

  for (let move = 0; move < maxMoves; move++) {
    let bestGain = -Infinity;
    let bestOut: Player | null = null;
    let bestIn: ProjectedPlayer | null = null;

    for (const outPlayer of workingPlayers) {
      const outProj = projMap.get(outPlayer.id) ??
        projectPlayer(outPlayer, ENGINE_CONFIG.TRANSFER_HORIZON_GW);
      const outHorizon = outProj.projHorizon;

      for (const inPlayer of allPlayers) {
        // Must be same position
        if (inPlayer.pos !== outPlayer.pos) continue;
        // Must not already be owned
        if (ownedIds.has(inPlayer.id)) continue;
        // Must not be the player being swapped out in this move
        if (inPlayer.id === outPlayer.id) continue;
        // Affordability: price of inPlayer ≤ price of outPlayer + current bank
        const sellingPrice = opts.sellingPrices?.[outPlayer.id] ?? outPlayer.price;
        if (inPlayer.price > sellingPrice + currentBank) continue;
        // Club cap: after removing outPlayer, adding inPlayer must not exceed 3/club
        const outTeamCount = clubCount[outPlayer.team] ?? 0;
        const inTeamCount = clubCount[inPlayer.team] ?? 0;
        // If they're different teams, check in-player's team won't exceed cap
        if (
          inPlayer.team !== outPlayer.team &&
          inTeamCount >= ENGINE_CONFIG.MAX_PER_CLUB
        ) continue;

        // Recency-chasing guard: never recommend a transfer purely on last-GW points.
        // We evaluate over the full horizon — this naturally handles it since
        // a one-GW-wonder shows up poorly on projHorizon.

        const gain = inPlayer.projHorizon - outHorizon;

        if (gain > bestGain) {
          bestGain = gain;
          bestOut = outPlayer;
          bestIn = inPlayer;
        }
      }
    }

    if (!bestOut || !bestIn) break;

    const isFree = move < freeTransfers;
    const threshold = isFree ? ENGINE_CONFIG.FREE_TRANSFER_MIN_GAIN : ENGINE_CONFIG.HIT_MIN_GAIN;

    if (bestGain <= threshold) break;

    // Apply the move
    const tookHit = !isFree;
    if (tookHit) hitsTaken++;

    const netGain = bestGain - (tookHit ? ENGINE_CONFIG.HIT_COST_PTS : 0);

    moves.push({
      out: bestOut,
      in: bestIn,
      outSellingPrice: opts.sellingPrices?.[bestOut.id] ?? bestOut.price,
      gain: bestGain,
      tookHit,
      netGain,
    });

    // Update working state
    const bankDelta = (opts.sellingPrices?.[bestOut.id] ?? bestOut.price) - bestIn.price;
    currentBank += bankDelta;

    // Update club counts
    clubCount[bestOut.team] = (clubCount[bestOut.team] ?? 1) - 1;
    clubCount[bestIn.team] = (clubCount[bestIn.team] ?? 0) + 1;

    // Update owned ids
    ownedIds.delete(bestOut.id);
    ownedIds.add(bestIn.id);

    // Update working players list
    workingPlayers = workingPlayers.map((p) =>
      p.id === bestOut!.id ? bestIn! : p
    );
  }

  const projNetGain = moves.reduce((s, m) => s + m.gain, 0) - hitsTaken * ENGINE_CONFIG.HIT_COST_PTS;

  let recommendation: 'bank' | 'transfer' | 'hit';
  if (moves.length === 0) {
    recommendation = 'bank';
  } else if (hitsTaken > 0) {
    recommendation = 'hit';
  } else {
    recommendation = 'transfer';
  }

  return { moves, hitsTaken, projNetGain, recommendation };
}
