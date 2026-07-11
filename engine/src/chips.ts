import { Player, Squad, ChipAdvice, ChipStatus, ProjectedPlayer, ChipAvailability, ChipKey } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { projectPlayer, projectPlayers } from './projection.js';
import { rebuildSquad } from './squad.js';

interface GwContext {
  gw: number;
  // For each GW in the season, which players in squad have no fixture (blank)
  blankCountsByGw: Record<number, number>;
  // For each GW, how many owned players have a DGW
  dgwCountsByGw: Record<number, number>;
  // Total GWs in season
  totalGws: number;
  allPlayers: ProjectedPlayer[];
}

function wildcardAdvice(
  squad: Squad,
  currentGw: number,
  ctx: GwContext
): ChipAdvice {
  if (currentGw < ENGINE_CONFIG.WILDCARD.MIN_GW) {
    return {
      recommend: false,
      gw: null,
      reason: `Wildcard locked until GW${ENGINE_CONFIG.WILDCARD.MIN_GW}. Currently GW${currentGw}.`,
      projectedValue: 0,
      confidence: 'high',
    };
  }

  // Compute drift for current and last two GWs
  const driftWindow = ENGINE_CONFIG.WILDCARD.DRIFT_WINDOW_GW;
  const drifts: number[] = [];

  for (let offset = 0; offset < driftWindow; offset++) {
    const gwToCheck = currentGw - offset;
    if (gwToCheck < 1) break;

    // Optimal rebuild projected horizon
    const optimal = rebuildSquad(ctx.allPlayers, gwToCheck, ENGINE_CONFIG.TRANSFER_HORIZON_GW);
    const optimalHorizon = optimal.players.reduce((sum, p) => {
      const proj = projectPlayer(p, ENGINE_CONFIG.TRANSFER_HORIZON_GW);
      return sum + proj.projHorizon;
    }, 0);

    // Current squad projected horizon
    const currentHorizon = squad.players.reduce((sum, p) => {
      const proj = projectPlayer(p, ENGINE_CONFIG.TRANSFER_HORIZON_GW);
      return sum + proj.projHorizon;
    }, 0);

    drifts.push(optimalHorizon - currentHorizon);
  }

  if (drifts.length < driftWindow) {
    return {
      recommend: false,
      gw: null,
      reason: `Not enough gameweek history to compute sustained drift (need ${driftWindow} GWs).`,
      projectedValue: 0,
      confidence: 'high',
    };
  }

  const sustainedDrift = drifts.reduce((s, d) => s + d, 0) / drifts.length;

  if (sustainedDrift < ENGINE_CONFIG.WILDCARD.MIN_SUSTAINED_DRIFT) {
    return {
      recommend: false,
      gw: null,
      reason: `Wildcard guarded: 3-GW sustained drift ${sustainedDrift.toFixed(1)} < ${ENGINE_CONFIG.WILDCARD.MIN_SUSTAINED_DRIFT} threshold.`,
      projectedValue: sustainedDrift,
      confidence: 'high',
    };
  }

  return {
    recommend: true,
    gw: currentGw,
    reason: `Sustained drift ${sustainedDrift.toFixed(1)} xP/GW exceeds threshold. Your squad is significantly behind the optimal over 5 GWs.`,
    projectedValue: sustainedDrift * ENGINE_CONFIG.TRANSFER_HORIZON_GW,
    confidence: 'high',
  };
}

function freeHitAdvice(
  squad: Squad,
  currentGw: number,
  ctx: GwContext
): ChipAdvice {
  // Find GWs where ≥3 owned players have no fixture
  const qualifyingGws: Array<{ gw: number; blanks: number; value: number }> = [];

  for (let gw = currentGw; gw <= ctx.totalGws; gw++) {
    const blanks = ctx.blankCountsByGw[gw] ?? 0;
    if (blanks >= ENGINE_CONFIG.FREE_HIT.BLANK_OWNED_THRESHOLD) {
      // Estimate value: projected xP of optimal rebuild this GW vs current squad xP
      const optimal = rebuildSquad(ctx.allPlayers, gw, 1);
      const optValue = optimal.players.reduce((sum, p) => {
        const proj = projectPlayer(p, 1);
        return sum + (proj.projByGw[0] ?? 0);
      }, 0);

      const currentValue = squad.players.reduce((sum, p) => {
        const proj = projectPlayer(p, 1);
        return sum + (proj.projByGw[0] ?? 0);
      }, 0);

      qualifyingGws.push({ gw, blanks, value: optValue - currentValue });
    }
  }

  if (qualifyingGws.length === 0) {
    // No blank GW — hold for the largest double gameweek instead
    // Find GW with most DGW players owned
    let bestDgwGw = currentGw;
    let bestDgwCount = 0;
    for (const [gw, count] of Object.entries(ctx.dgwCountsByGw)) {
      if (count > bestDgwCount) {
        bestDgwCount = count;
        bestDgwGw = Number(gw);
      }
    }

    return {
      recommend: false,
      gw: bestDgwGw > 0 ? bestDgwGw : null,
      reason: `No blank gameweek detected (you have <${ENGINE_CONFIG.FREE_HIT.BLANK_OWNED_THRESHOLD} blanking players in any GW). Free Hit is a rescue chip — hold for the largest double gameweek (GW${bestDgwGw}).`,
      projectedValue: 0,
      confidence: 'medium',
    };
  }

  const best = qualifyingGws.sort((a, b) => b.value - a.value)[0]!;

  return {
    recommend: true,
    gw: best.gw,
    reason: `GW${best.gw}: ${best.blanks} of your players blank. Free Hit rescues ~${best.value.toFixed(1)} projected xP vs. your current squad.`,
    projectedValue: best.value,
    confidence: 'medium',
  };
}

function benchBoostAdvice(
  squad: Squad,
  currentGw: number,
  ctx: GwContext
): ChipAdvice {
  // Find the bench (4 lowest-projected starters, or bottom 4)
  const projected = squad.players.map((p) => projectPlayer(p, ENGINE_CONFIG.TRANSFER_HORIZON_GW));

  let bestScore = -Infinity;
  let bestGw = currentGw;
  let bestBenchValue = 0;

  for (let gw = currentGw; gw <= Math.min(ctx.totalGws, currentGw + 10); gw++) {
    const gwIndex = gw - currentGw;

    // Bench = 4 players with lowest projected xP for this GW
    const byGwXp = [...projected].sort(
      (a, b) => (a.projByGw[gwIndex] ?? 0) - (b.projByGw[gwIndex] ?? 0)
    );
    const bench = byGwXp.slice(0, 4);
    const benchProj = bench.reduce((s, p) => s + (p.projByGw[gwIndex] ?? 0), 0);

    const dgwOwned = ctx.dgwCountsByGw[gw] ?? 0;
    const score =
      benchProj +
      (dgwOwned >= ENGINE_CONFIG.BENCH_BOOST.DGW_PREFER_COUNT
        ? ENGINE_CONFIG.BENCH_BOOST.DGW_BONUS_WEIGHT
        : 0);

    if (score > bestScore) {
      bestScore = score;
      bestGw = gw;
      bestBenchValue = benchProj;
    }
  }

  return {
    recommend: true,
    gw: bestGw,
    reason: `Best bench boost opportunity: GW${bestGw} where bench projects ${bestBenchValue.toFixed(1)} xP${(ctx.dgwCountsByGw[bestGw] ?? 0) >= ENGINE_CONFIG.BENCH_BOOST.DGW_PREFER_COUNT ? ' (DGW bonus)' : ''}.`,
    projectedValue: bestBenchValue,
    confidence: 'high',
  };
}

function tripleCaptainAdvice(
  squad: Squad,
  currentGw: number,
  ctx: GwContext
): ChipAdvice {
  const projected = squad.players.map((p) => projectPlayer(p, ENGINE_CONFIG.TRANSFER_HORIZON_GW));

  let bestScore = -Infinity;
  let bestGw = currentGw;
  let bestCapProj = 0;

  for (let gw = currentGw; gw <= Math.min(ctx.totalGws, currentGw + 10); gw++) {
    const gwIndex = gw - currentGw;

    const capProj = Math.max(...projected.map((p) => p.projByGw[gwIndex] ?? 0));
    const dgwOwned = ctx.dgwCountsByGw[gw] ?? 0;
    const score =
      capProj +
      (dgwOwned >= 1 ? ENGINE_CONFIG.TRIPLE_CAPTAIN.DGW_BONUS_WEIGHT : 0);

    if (score > bestScore) {
      bestScore = score;
      bestGw = gw;
      bestCapProj = capProj;
    }
  }

  return {
    recommend: true,
    gw: bestGw,
    reason: `Best triple captain window: GW${bestGw} with captain projecting ${bestCapProj.toFixed(1)} xP. Confidence is LOW — single-week hauls are largely unpredictable.`,
    projectedValue: bestCapProj * 2, // extra captain points
    confidence: 'low',
  };
}

export function evaluateChips(
  squad: Squad,
  currentGw: number,
  ctx: GwContext,
  availability?: Partial<ChipAvailability>
): ChipStatus {
  const advice: ChipStatus = {
    wildcard: wildcardAdvice(squad, currentGw, ctx),
    freeHit: freeHitAdvice(squad, currentGw, ctx),
    benchBoost: benchBoostAdvice(squad, currentGw, ctx),
    tripleCaptain: tripleCaptainAdvice(squad, currentGw, ctx),
  };

  for (const key of Object.keys(advice) as ChipKey[]) {
    if (availability?.[key] === false) {
      advice[key] = {
        recommend: false,
        gw: null,
        reason: 'Already used — unavailable for the current chip window.',
        projectedValue: 0,
        confidence: 'high',
      };
    }
  }

  return advice;
}

export type { GwContext };
