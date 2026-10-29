import { Squad, ChipAdvice, ChipStatus, ProjectedPlayer, ChipAvailability, ChipKey } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { bestXI, optimizeSquad, squadValue } from './squad.js';

interface GwContext {
  gw: number;
  allPlayers: ProjectedPlayer[];
  /** Selling value of the current squad plus bank — the wildcard/free-hit budget. */
  budget?: number;
  /** Projected squad gain from the recommended free transfers this week. */
  transferGain?: number;
  /** Last GW of the current chip window (19 or 38). */
  windowEnd?: number;
}

const one = (x: number) => x.toFixed(1);

function horizonOf(players: ProjectedPlayer[]): number {
  return Math.max(1, ...players.map((p) => p.projByGw.length));
}

function wildcardAdvice(squad: Squad, gw: number, ctx: GwContext): ChipAdvice {
  const players = squad.players;
  const budget = ctx.budget ?? ENGINE_CONFIG.BUDGET;
  const opts = { horizon: Math.min(8, horizonOf(players)) };
  const rebuilt = optimizeSquad(ctx.allPlayers, { ...opts, budget });
  const gain = squadValue(rebuilt.players, opts) - squadValue(players, opts) - (ctx.transferGain ?? 0);
  const windowEnd = ctx.windowEnd ?? 38;
  const expiring = windowEnd - gw <= 2;
  const threshold = expiring ? 3 : ENGINE_CONFIG.WILDCARD.MIN_GAIN;
  if (gain >= threshold) {
    return {
      recommend: true,
      gw,
      reason: expiring
        ? `Your Wildcard expires after GW${windowEnd}. A rebuild projects ${one(gain)} pts more than your transfers alone over the next ${opts.horizon} GWs — use it rather than lose it.`
        : `A full rebuild projects ${one(gain)} pts more than using your free transfers over the next ${opts.horizon} GWs.`,
      projectedValue: gain,
      confidence: gain >= 2 * threshold ? 'high' : 'medium',
    };
  }
  return {
    recommend: false,
    gw: null,
    reason: `Hold. A rebuild would add only ${one(Math.max(0, gain))} pts over the next ${opts.horizon} GWs beyond your free transfers (needs ${threshold}+).${expiring ? '' : ` Must be used by GW${windowEnd}.`}`,
    projectedValue: Math.max(0, gain),
    confidence: 'medium',
  };
}

function freeHitAdvice(squad: Squad, gw: number, ctx: GwContext): ChipAdvice {
  const players = squad.players;
  const budget = ctx.budget ?? ENGINE_CONFIG.BUDGET;
  const horizon = Math.min(horizonOf(players), (ctx.windowEnd ?? 38) - gw + 1);
  let best = { k: -1, gain: 0 };
  for (let k = 0; k < horizon; k++) {
    const oneWeek = (p: ProjectedPlayer) => ({ ...p, projByGw: [p.projByGw[k] ?? 0] });
    const rebuilt = optimizeSquad(ctx.allPlayers.map(oneWeek), { horizon: 1, budget });
    const gain = squadValue(rebuilt.players, { horizon: 1 }) - squadValue(players.map(oneWeek), { horizon: 1 });
    if (gain > best.gain) best = { k, gain };
  }
  const threshold = ENGINE_CONFIG.FREE_HIT.MIN_GAIN;
  if (best.k === 0 && best.gain >= threshold) {
    return {
      recommend: true,
      gw,
      reason: `This week a one-off squad projects ${one(best.gain)} pts more than yours — the best Free Hit week in sight.`,
      projectedValue: best.gain,
      confidence: 'medium',
    };
  }
  const target = best.k > 0 ? gw + best.k : null;
  return {
    recommend: false,
    gw: target,
    reason: target && best.gain >= threshold
      ? `Hold for GW${target}, where a Free Hit projects ${one(best.gain)} pts over your squad (blank/double weeks are where it shines).`
      : `Hold. No week in sight gains more than ${one(Math.max(best.gain, 0))} pts from a Free Hit (needs ${threshold}+); save it for a blank or double gameweek.`,
    projectedValue: best.gain,
    confidence: 'medium',
  };
}

function benchBoostAdvice(squad: Squad, gw: number, ctx: GwContext): ChipAdvice {
  const players = squad.players;
  const horizon = Math.min(horizonOf(players), (ctx.windowEnd ?? 38) - gw + 1);
  let best = { k: 0, bench: -Infinity };
  for (let k = 0; k < horizon; k++) {
    const bench = bestXI({ players }, k).bench.reduce((s, p) => s + (p.projByGw[k] ?? 0), 0);
    if (bench > best.bench) best = { k, bench };
  }
  const threshold = ENGINE_CONFIG.BENCH_BOOST.MIN_BENCH_PTS;
  const now = best.k === 0 && best.bench >= threshold;
  return {
    recommend: now,
    gw: gw + best.k,
    reason: now
      ? `Your bench projects ${one(best.bench)} pts this week — the best Bench Boost week in sight.`
      : `Hold. Your best bench week in sight is GW${gw + best.k} at ${one(best.bench)} projected pts; aim for ${threshold}+ (usually a double gameweek).`,
    projectedValue: best.bench,
    confidence: now ? 'medium' : 'low',
  };
}

function tripleCaptainAdvice(squad: Squad, gw: number, ctx: GwContext): ChipAdvice {
  const players = squad.players;
  const horizon = Math.min(horizonOf(players), (ctx.windowEnd ?? 38) - gw + 1);
  let best = { k: 0, xp: -Infinity, name: '' };
  for (let k = 0; k < horizon; k++) {
    const cap = bestXI({ players }, k).captain;
    const xp = cap.projByGw[k] ?? 0;
    if (xp > best.xp) best = { k, xp, name: cap.name };
  }
  const threshold = ENGINE_CONFIG.TRIPLE_CAPTAIN.MIN_CAPTAIN_PTS;
  const now = best.k === 0 && best.xp >= threshold;
  return {
    recommend: now,
    gw: gw + best.k,
    reason: now
      ? `${best.name} projects ${one(best.xp)} pts this week — the strongest captain week in sight. Single-week hauls are volatile, so treat this as a nudge.`
      : `Hold. Your strongest captain week in sight is GW${gw + best.k} (${best.name}, ${one(best.xp)} pts); aim for ${threshold}+ — usually a double gameweek.`,
    projectedValue: Math.max(0, best.xp),
    confidence: 'low',
  };
}

export function evaluateChips(
  squad: Squad,
  currentGw: number,
  ctx: GwContext,
  availability?: Partial<ChipAvailability>
): ChipStatus {
  const unavailable: ChipAdvice = {
    recommend: false,
    gw: null,
    reason: 'Not available in the current chip window.',
    projectedValue: 0,
    confidence: 'high',
  };
  const usable = (key: ChipKey) => availability?.[key] == null || availability[key]! > 0;
  return {
    wildcard: usable('wildcard') ? wildcardAdvice(squad, currentGw, ctx) : unavailable,
    freeHit: usable('freeHit') ? freeHitAdvice(squad, currentGw, ctx) : unavailable,
    benchBoost: usable('benchBoost') ? benchBoostAdvice(squad, currentGw, ctx) : unavailable,
    tripleCaptain: usable('tripleCaptain') ? tripleCaptainAdvice(squad, currentGw, ctx) : unavailable,
  };
}

export type { GwContext };
