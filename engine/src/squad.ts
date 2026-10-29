import { Player, Pos, ProjectedPlayer, Squad, XI } from './types.js';
import { ENGINE_CONFIG } from './config.js';
import { pickCaptain } from './captain.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSquad(squad: { players: Player[] }, _atPrices?: Record<number, number>): ValidationResult {
  const errors: string[] = [];
  const { players } = squad;

  if (players.length !== ENGINE_CONFIG.SQUAD_SIZE) {
    errors.push(`Squad must have exactly ${ENGINE_CONFIG.SQUAD_SIZE} players, got ${players.length}`);
  }

  // Check position quotas
  const quotaCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) {
    quotaCounts[p.pos] = (quotaCounts[p.pos] ?? 0) + 1;
  }
  for (const [pos, required] of Object.entries(ENGINE_CONFIG.SQUAD_QUOTA)) {
    if ((quotaCounts[pos] ?? 0) !== required) {
      errors.push(`${pos} quota: need ${required}, got ${quotaCounts[pos] ?? 0}`);
    }
  }

  // Check club cap (≤3 per club)
  const clubCounts: Record<number, number> = {};
  for (const p of players) {
    clubCounts[p.team] = (clubCounts[p.team] ?? 0) + 1;
    if (clubCounts[p.team] === ENGINE_CONFIG.MAX_PER_CLUB + 1) {
      errors.push(`Too many players from team ${p.team} (max ${ENGINE_CONFIG.MAX_PER_CLUB})`);
    }
  }

  // Check total price ≤ £100m
  const totalPrice = players.reduce((sum, p) => sum + p.price, 0);
  if (totalPrice > ENGINE_CONFIG.BUDGET + 0.001) {
    errors.push(`Squad costs £${totalPrice.toFixed(1)}m, exceeds £${ENGINE_CONFIG.BUDGET}m budget`);
  }

  // Check no duplicate players (compare by id, not object identity)
  const ids = new Set<number>();
  for (const p of players) {
    if (ids.has(p.id)) {
      errors.push(`Duplicate player id ${p.id} (${p.name})`);
    }
    ids.add(p.id);
  }

  return { ok: errors.length === 0, errors };
}

const MIN_START: Record<Pos, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const MAX_START: Record<Pos, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const POS_ORDER: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/**
 * Highest-scoring legal XI for one gameweek. Taking the best players needed to
 * meet each position minimum, then the best of the rest within the maxima, is
 * optimal for FPL's formation rules.
 */
export function selectXI<T extends { pos: Pos }>(players: T[], score: (p: T) => number): { starters: T[]; bench: T[] } {
  const sorted = [...players].sort((a, b) => score(b) - score(a));
  const starters: T[] = [];
  const used = new Set<T>();
  const count: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Pos[]) {
    for (const p of sorted) {
      if (count[pos] >= MIN_START[pos]) break;
      if (p.pos !== pos) continue;
      starters.push(p);
      used.add(p);
      count[pos]++;
    }
  }
  for (const p of sorted) {
    if (starters.length >= 11) break;
    if (used.has(p) || count[p.pos] >= MAX_START[p.pos]) continue;
    starters.push(p);
    used.add(p);
    count[p.pos]++;
  }
  // Bench: outfield players by projection, reserve goalkeeper last (FPL bench order).
  const bench = sorted.filter((p) => !used.has(p));
  bench.sort((a, b) => (a.pos === 'GK' ? 1 : 0) - (b.pos === 'GK' ? 1 : 0) || score(b) - score(a));
  return { starters, bench };
}

export interface SquadValueOptions {
  horizon?: number;
  /** Weight of GW+k relative to GW+0 is discount^k. */
  discount?: number;
  /** Value of a bench point (they only count through auto-subs). */
  benchWeight?: number;
}

/**
 * Expected FPL points a squad would score over the horizon if its best XI is
 * picked each week and the top projection is captained.
 */
export function squadValue(players: ProjectedPlayer[], opts: SquadValueOptions = {}): number {
  const horizon = opts.horizon ?? ENGINE_CONFIG.TRANSFER_HORIZON_GW;
  const discount = opts.discount ?? ENGINE_CONFIG.HORIZON_DISCOUNT;
  const benchWeight = opts.benchWeight ?? ENGINE_CONFIG.BENCH_WEIGHT;
  let total = 0;
  let w = 1;
  for (let k = 0; k < horizon; k++) {
    total += w * gwValue(players, k, benchWeight);
    w *= discount;
  }
  return total;
}

// Hot path for the transfer search: reuses buffers instead of allocating.
const POS_INDEX: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const MIN_BY_INDEX = [1, 3, 2, 1];
const MAX_BY_INDEX = [1, 5, 5, 3];
let order = new Int32Array(16);
let vals = new Float64Array(16);
let posIdx = new Int32Array(16);
let taken = new Uint8Array(16);

function gwValue(players: ProjectedPlayer[], k: number, benchWeight: number): number {
  const n = players.length;
  if (order.length < n) {
    order = new Int32Array(n);
    vals = new Float64Array(n);
    posIdx = new Int32Array(n);
    taken = new Uint8Array(n);
  }
  for (let i = 0; i < n; i++) {
    const p = players[i]!;
    vals[i] = p.projByGw[k] ?? 0;
    posIdx[i] = POS_INDEX[p.pos];
    taken[i] = 0;
    // Insertion sort by value, descending (n = 15).
    let j = i - 1;
    while (j >= 0 && vals[order[j]!]! < vals[i]!) {
      order[j + 1] = order[j]!;
      j--;
    }
    order[j + 1] = i;
  }
  const count = [0, 0, 0, 0];
  let xi = 0;
  let starters = 0;
  let captain = 0;
  for (let pos = 0; pos < 4; pos++) {
    for (let r = 0; r < n && count[pos]! < MIN_BY_INDEX[pos]!; r++) {
      const i = order[r]!;
      if (posIdx[i] !== pos) continue;
      taken[i] = 1;
      count[pos]!++;
      starters++;
      xi += vals[i]!;
      if (vals[i]! > captain) captain = vals[i]!;
    }
  }
  for (let r = 0; r < n && starters < 11; r++) {
    const i = order[r]!;
    const pos = posIdx[i]!;
    if (taken[i] || count[pos]! >= MAX_BY_INDEX[pos]!) continue;
    taken[i] = 1;
    count[pos]!++;
    starters++;
    xi += vals[i]!;
    if (vals[i]! > captain) captain = vals[i]!;
  }
  let bench = 0;
  for (let i = 0; i < n; i++) if (!taken[i] && posIdx[i] !== 0) bench += vals[i]!;
  return xi + captain + benchWeight * bench;
}

export function bestXI(squad: { players: ProjectedPlayer[] }, gwIndex: number = 0): XI {
  const score = (p: ProjectedPlayer) => p.projByGw[gwIndex] ?? 0;
  const { starters, bench } = selectXI(squad.players, score);
  starters.sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || score(b) - score(a));
  const { captain, viceCaptain } = pickCaptain(starters, gwIndex);
  return { starters, bench, captain, viceCaptain };
}

interface OptimizeOptions extends SquadValueOptions {
  budget?: number;
  locked?: number[];
  excluded?: number[];
}

/**
 * Best 15-man squad within budget: a value-per-£ greedy start followed by
 * hill-climbing over single and paired swaps scored by squadValue.
 */
export function optimizeSquad(players: ProjectedPlayer[], opts: OptimizeOptions = {}): Squad {
  const budget = opts.budget ?? ENGINE_CONFIG.BUDGET;
  const locked = new Set(opts.locked ?? []);
  const excluded = new Set(opts.excluded ?? []);
  const pool = players.filter((p) => !excluded.has(p.id) && p.price > 0);
  const horizonScore = (p: ProjectedPlayer) => p.projByGw.slice(0, opts.horizon ?? ENGINE_CONFIG.TRANSFER_HORIZON_GW)
    .reduce((s, v) => s + v, 0);

  const squad: ProjectedPlayer[] = pool.filter((p) => locked.has(p.id));
  const posCount: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubCount: Record<number, number> = {};
  for (const p of squad) {
    posCount[p.pos]++;
    clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
  }
  const cost = () => squad.reduce((s, p) => s + p.price, 0);
  const cheapest = (pos: Pos) => Math.min(...pool.filter((p) => p.pos === pos).map((p) => p.price));
  const reserveFor = () => (['GK', 'DEF', 'MID', 'FWD'] as Pos[])
    .reduce((s, pos) => s + Math.max(0, ENGINE_CONFIG.SQUAD_QUOTA[pos]! - posCount[pos]) * cheapest(pos), 0);

  // Greedy start by value per £ above the cheapest option, keeping room to finish the squad.
  const byValue = [...pool].sort((a, b) =>
    horizonScore(b) / Math.max(0.5, b.price - 3.5) - horizonScore(a) / Math.max(0.5, a.price - 3.5));
  for (const p of byValue) {
    if (squad.length >= ENGINE_CONFIG.SQUAD_SIZE) break;
    if (squad.includes(p) || posCount[p.pos] >= ENGINE_CONFIG.SQUAD_QUOTA[p.pos]!) continue;
    if ((clubCount[p.team] ?? 0) >= ENGINE_CONFIG.MAX_PER_CLUB) continue;
    posCount[p.pos]++;
    const fits = cost() + p.price + reserveFor() <= budget + 1e-6;
    posCount[p.pos]--;
    if (!fits) continue;
    squad.push(p);
    posCount[p.pos]++;
    clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
  }
  if (squad.length < ENGINE_CONFIG.SQUAD_SIZE) {
    throw new Error('optimizeSquad could not fill a legal squad within budget');
  }

  // Hill-climb: cheap single swaps until they stall, then try a paired swap
  // (sell one to fund another) and go back to singles if it helped.
  let current = squad;
  for (let iter = 0; iter < 60; iter++) {
    const bank = budget - current.reduce((s, p) => s + p.price, 0);
    const sell = Object.fromEntries(current.map((p) => [p.id, p.price]));
    const search = { ...opts, bank, sellingPrices: sell, locked, candidatesPerPos: 15 };
    const single = searchMoves(current, pool, { ...search, maxMoves: 1 });
    if (single && single.gain > 1e-6) {
      current = single.squad;
      continue;
    }
    const pair = searchMoves(current, pool, { ...search, maxMoves: 2 });
    if (!pair || pair.gain <= 1e-6) break;
    current = pair.squad;
  }
  return { players: current };
}

// ---- Transfer search shared by the planner and the optimizer ----

export interface MoveSearchOptions extends SquadValueOptions {
  bank: number;
  sellingPrices: Record<number, number>;
  maxMoves: number;
  locked?: Set<number>;
  /** Incoming candidates per position considered (by projected value). */
  candidatesPerPos?: number;
  /** Players that must not be bought (e.g. sold earlier in the same plan). */
  excludeIds?: Set<number>;
}

export interface MoveSet {
  outs: ProjectedPlayer[];
  ins: ProjectedPlayer[];
  squad: ProjectedPlayer[];
  gain: number;
  bankAfter: number;
}

/** Best set of exactly n moves for each n ≤ maxMoves (index = n). */
export function bestMoveSets(
  squad: ProjectedPlayer[],
  pool: ProjectedPlayer[],
  opts: MoveSearchOptions
): Array<MoveSet | null> {
  const value = (players: ProjectedPlayer[]) => squadValue(players, opts);
  const base = value(squad);
  const owned = new Set(squad.map((p) => p.id));
  const horizon = opts.horizon ?? ENGINE_CONFIG.TRANSFER_HORIZON_GW;
  const candN = opts.candidatesPerPos ?? 20;
  const sumProj = (p: ProjectedPlayer) => p.projByGw.slice(0, horizon).reduce((s, v) => s + v, 0);

  // Candidate pool per position: best projected players plus a few cheap enablers.
  const candidates: Record<Pos, ProjectedPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Pos[]) {
    const ofPos = pool.filter((p) => p.pos === pos && !owned.has(p.id) && !opts.excludeIds?.has(p.id));
    const top = [...ofPos].sort((a, b) => sumProj(b) - sumProj(a)).slice(0, pos === 'GK' ? Math.ceil(candN / 2) : candN);
    const cheap = [...ofPos].filter((p) => (p.pStart ?? 0) > 0.6).sort((a, b) => a.price - b.price || sumProj(b) - sumProj(a)).slice(0, 4);
    candidates[pos] = [...new Set([...top, ...cheap])];
  }

  const sell = (p: ProjectedPlayer) => opts.sellingPrices[p.id] ?? p.price;
  const clubCount: Record<number, number> = {};
  for (const p of squad) clubCount[p.team] = (clubCount[p.team] ?? 0) + 1;
  const outs = squad.filter((p) => !opts.locked?.has(p.id));

  const results: Array<MoveSet | null> = [{ outs: [], ins: [], squad, gain: 0, bankAfter: opts.bank }];
  if (opts.maxMoves < 1) return results;

  const apply = (outIds: ProjectedPlayer[], ins: ProjectedPlayer[]) =>
    squad.map((p) => {
      const i = outIds.indexOf(p);
      return i >= 0 ? ins[i]! : p;
    });

  const clubOk = (outList: ProjectedPlayer[], inList: ProjectedPlayer[]) => {
    const delta: Record<number, number> = {};
    for (const p of outList) delta[p.team] = (delta[p.team] ?? 0) - 1;
    for (const p of inList) delta[p.team] = (delta[p.team] ?? 0) + 1;
    return Object.entries(delta).every(([t, d]) => d <= 0 || (clubCount[Number(t)] ?? 0) + d <= ENGINE_CONFIG.MAX_PER_CLUB);
  };

  // Every single swap, scored without the budget so pairs can reuse the gains.
  const swapGain = new Map<ProjectedPlayer, Array<{ c: ProjectedPlayer; gain: number }>>();
  let bestSingle: MoveSet | null = null;
  for (const o of outs) {
    const list: Array<{ c: ProjectedPlayer; gain: number }> = [];
    for (const c of candidates[o.pos]) {
      if (!clubOk([o], [c])) continue;
      const next = apply([o], [c]);
      const gain = value(next) - base;
      list.push({ c, gain });
      const bankAfter = opts.bank + sell(o) - c.price;
      if (bankAfter >= -1e-6 && (!bestSingle || gain > bestSingle.gain)) {
        bestSingle = { outs: [o], ins: [c], squad: next, gain, bankAfter };
      }
    }
    list.sort((a, b) => b.gain - a.gain);
    swapGain.set(o, list);
  }
  results[1] = bestSingle;
  if (opts.maxMoves < 2) return results;

  // Pairs let one sale fund another upgrade. Each outgoing player is paired
  // using its strongest replacements plus its cheapest (budget-freeing) ones.
  const shortlist = new Map<ProjectedPlayer, ProjectedPlayer[]>();
  for (const [o, list] of swapGain) {
    const strongest = list.slice(0, 6).map((x) => x.c);
    const cheapest = [...list].sort((a, b) => a.c.price - b.c.price || b.gain - a.gain).slice(0, 3).map((x) => x.c);
    shortlist.set(o, [...new Set([...strongest, ...cheapest])]);
  }
  let bestPair: MoveSet | null = null;
  for (let i = 0; i < outs.length; i++) {
    for (let j = i + 1; j < outs.length; j++) {
      const o1 = outs[i]!, o2 = outs[j]!;
      const funds = opts.bank + sell(o1) + sell(o2);
      for (const c1 of shortlist.get(o1) ?? []) {
        if (c1.price > funds) continue;
        for (const c2 of shortlist.get(o2) ?? []) {
          if (c1 === c2 || c1.price + c2.price > funds + 1e-6) continue;
          if (!clubOk([o1, o2], [c1, c2])) continue;
          const next = apply([o1, o2], [c1, c2]);
          const gain = value(next) - base;
          if (!bestPair || gain > bestPair.gain) {
            bestPair = { outs: [o1, o2], ins: [c1, c2], squad: next, gain, bankAfter: funds - c1.price - c2.price };
          }
        }
      }
    }
  }
  results[2] = bestPair;

  // Three or more moves: extend the best set greedily one move at a time.
  let prev = bestPair;
  for (let n = 3; n <= opts.maxMoves && prev; n++) {
    const sub = bestMoveSets(prev.squad, pool, {
      ...opts,
      bank: prev.bankAfter,
      maxMoves: 1,
      locked: new Set([...(opts.locked ?? []), ...prev.ins.map((p) => p.id)]),
      excludeIds: new Set([...(opts.excludeIds ?? []), ...prev.outs.map((p) => p.id)]),
    })[1];
    if (!sub) break;
    prev = {
      outs: [...prev.outs, ...sub.outs],
      ins: [...prev.ins, ...sub.ins],
      squad: sub.squad,
      gain: prev.gain + sub.gain,
      bankAfter: sub.bankAfter,
    };
    results[n] = prev;
  }
  return results;
}

function searchMoves(squad: ProjectedPlayer[], pool: ProjectedPlayer[], opts: MoveSearchOptions): MoveSet | null {
  const sets = bestMoveSets(squad, pool, opts).filter((s): s is MoveSet => s != null && s.outs.length > 0);
  return sets.sort((a, b) => b.gain - a.gain)[0] ?? null;
}
