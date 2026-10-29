import type { Pos } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { freeTransfersAfter } from './transfers.js';

// ---------------------------------------------------------------------------
// Season replay: score selections exactly as FPL does (auto-subs, captaincy,
// chips, hits) and follow an advisor week by week from a starting squad.
// Used by the in-app track record and the offline backtests.
// ---------------------------------------------------------------------------

export interface ReplayData {
  pos(id: number): Pos;
  /** FPL points and minutes in a finished GW (0/0 in a blank). */
  actual(id: number, gw: number): { pts: number; mins: number };
  /** Price at the GW deadline. */
  price(id: number, gw: number): number;
}

export interface Selection {
  starters: number[];
  /** Outfield substitutes in priority order; the reserve GK may appear anywhere. */
  bench: number[];
  captain: number;
  vice: number;
}

export type ChipName = 'wildcard' | 'freehit' | 'bboost' | '3xc';

export function scoreSelection(
  data: ReplayData,
  gw: number,
  sel: Selection,
  chip: ChipName | null = null
): number {
  const act = (id: number) => data.actual(id, gw);
  const captainPts = () => {
    const mult = chip === '3xc' ? 2 : 1;
    if (act(sel.captain).mins > 0) return act(sel.captain).pts * mult;
    if (act(sel.vice).mins > 0) return act(sel.vice).pts * mult;
    return 0;
  };
  if (chip === 'bboost') {
    return [...sel.starters, ...sel.bench].reduce((s, id) => s + act(id).pts, 0) + captainPts();
  }

  const xi = [...sel.starters];
  const benchGk = sel.bench.filter((id) => data.pos(id) === 'GK');
  const benchOut = sel.bench.filter((id) => data.pos(id) !== 'GK');
  const gkIndex = xi.findIndex((id) => data.pos(id) === 'GK');
  if (gkIndex >= 0 && act(xi[gkIndex]!).mins === 0 && benchGk[0] != null && act(benchGk[0]).mins > 0) {
    xi[gkIndex] = benchGk[0];
  }
  const used = new Set<number>();
  for (let i = 0; i < xi.length; i++) {
    const id = xi[i]!;
    if (data.pos(id) === 'GK' || act(id).mins > 0) continue;
    for (const sub of benchOut) {
      if (used.has(sub) || act(sub).mins === 0) continue;
      const trial = [...xi];
      trial[i] = sub;
      const count: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const t of trial) count[data.pos(t)]++;
      if (count.DEF >= 3 && count.MID >= 2 && count.FWD >= 1) {
        xi[i] = sub;
        used.add(sub);
        break;
      }
    }
  }
  return xi.reduce((s, id) => s + act(id).pts, 0) + captainPts();
}

/** FPL selling price: half of any profit (rounded down to £0.1m), all of any loss. */
export function sellingPrice(purchase: number, now: number): number {
  if (now <= purchase) return now;
  const profitTenths = Math.floor(Math.round((now - purchase) * 10) / 2);
  return Math.round(purchase * 10 + profitTenths) / 10;
}

export interface AdvisorState {
  gw: number;
  squad: number[];
  bank: number;
  freeTransfers: number;
  sellingPrices: Record<number, number>;
}

export interface Advice extends Selection {
  transfers: Array<{ out: number; in: number }>;
  reason?: string;
}

export type AdviseFn = (state: AdvisorState) => Advice;

export interface ReplayWeek {
  gw: number;
  chip: ChipName | null;
  freeTransfers: number;
  transfers: Array<{ out: number; in: number }>;
  hits: number;
  captain: number;
  /** Points scored this GW after hit costs. */
  points: number;
  reason?: string;
}

export interface ReplayStart {
  squad: number[];
  purchasePrices: Record<number, number>;
  bank: number;
  freeTransfers: number;
}

/**
 * Follow an advisor from the startGw deadline through endGw. Chips are played
 * in the weeks given; a Free Hit week scores `freeHitPoints[gw]` (the
 * manager's real one-week team) and leaves the squad untouched.
 */
export function followAdvisor(
  data: ReplayData,
  advise: AdviseFn,
  start: ReplayStart,
  startGw: number,
  endGw: number,
  chips: Record<number, ChipName> = {},
  freeHitPoints: Record<number, number> = {}
): { total: number; weeks: ReplayWeek[] } {
  let squad = [...start.squad];
  const purchase = { ...start.purchasePrices };
  let bank = start.bank;
  let ft = start.freeTransfers;
  let total = 0;
  const weeks: ReplayWeek[] = [];

  for (let gw = startGw; gw <= endGw; gw++) {
    const chip = chips[gw] ?? null;
    if (chip === 'freehit') {
      const points = freeHitPoints[gw] ?? 0;
      total += points;
      weeks.push({ gw, chip, freeTransfers: ft, transfers: [], hits: 0, captain: 0, points });
      continue;
    }
    const sellingPrices: Record<number, number> = {};
    for (const id of squad) sellingPrices[id] = sellingPrice(purchase[id] ?? data.price(id, gw), data.price(id, gw));
    const wildcard = chip === 'wildcard';
    const advice = advise({ gw, squad, bank, freeTransfers: wildcard ? 15 : ft, sellingPrices });
    for (const t of advice.transfers) {
      bank += sellingPrices[t.out]! - data.price(t.in, gw);
      delete purchase[t.out];
      purchase[t.in] = data.price(t.in, gw);
      squad = squad.map((id) => (id === t.out ? t.in : id));
    }
    const n = advice.transfers.length;
    const hits = wildcard ? 0 : Math.max(0, n - ft);
    const points = scoreSelection(data, gw, advice, chip) - ENGINE_CONFIG.HIT_COST_PTS * hits;
    total += points;
    weeks.push({ gw, chip, freeTransfers: ft, transfers: advice.transfers, hits, captain: advice.captain, points, reason: advice.reason });
    if (!wildcard) ft = freeTransfersAfter(ft, n);
  }
  return { total, weeks };
}
