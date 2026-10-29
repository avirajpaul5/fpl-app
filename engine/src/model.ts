import type { Pos } from './types.js';

// ---------------------------------------------------------------------------
// Expected-points model
//
// Every projection is built from FPL's own scoring rules:
//   appearance + goals + assists + clean sheet − goals conceded + saves
//   + bonus + defensive contribution − cards
// Each component is a per-90 (or per-match) rate estimated from the season so
// far with recency weighting, shrunk towards a price/position prior, then
// scaled by expected minutes and by opponent strength from team xG data.
// Parameters were tuned on 2023-24..2025-26 and checked on the 2026-27
// season as a holdout (see engine/backtest).
// ---------------------------------------------------------------------------

/** One player's output in one finished gameweek (summed across a double). */
export interface GwStat {
  gw: number;
  /** Club the player represented that week; defaults to the current club. */
  team?: number;
  minutes: number;
  starts: number;
  points: number;
  xg: number;
  xa: number;
  /** Expected goals conceded while the player was on the pitch. */
  xgc: number;
  goals: number;
  assists: number;
  saves: number;
  bonus: number;
  defcon: number;
  yellow: number;
  red: number;
}

/** A player's totals from the previous season, used as a prior. */
export interface SeasonPrior {
  minutes: number;
  starts: number;
  /** Matches the player's club played while he was registered. */
  fixtures: number;
  xg: number;
  xa: number;
  goals: number;
  assists: number;
  bonus: number;
  saves: number;
  yellow: number;
  /** 60+ minute single-match appearances, and how many reached the defcon threshold. */
  defconGames: number;
  defconHits: number;
}

export interface ModelPlayer {
  id: number;
  pos: Pos;
  team: number;
  price: number;
  /** Finished gameweeks in which the player was registered, any order. */
  history: GwStat[];
  /** Last season's totals, when the player was in the league. */
  prior?: SeasonPrior;
  status?: string;
  chanceNext?: number | null;
  news?: string;
}

export interface ModelFixture {
  id: number;
  gw: number;
  home: number;
  away: number;
}

export interface ScoringRules {
  goal: Record<Pos, number>;
  assist: number;
  cleanSheet: Record<Pos, number>;
  /** Points per two goals conceded (negative). */
  goalsConceded: Record<Pos, number>;
  /** Points for reaching the defensive-contribution threshold (0 = rule off). */
  defcon: Record<Pos, number>;
  defconThreshold: Record<Pos, number>;
}

export const DEFAULT_RULES: ScoringRules = {
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  goalsConceded: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  defcon: { GK: 0, DEF: 2, MID: 2, FWD: 2 },
  defconThreshold: { GK: Infinity, DEF: 10, MID: 12, FWD: 12 },
};

export const MODEL_PARAMS = {
  /** Half-life (GWs) for next-GW start probability — recent selection matters most. */
  minutesHalfLife: 1,
  /** Half-life (GWs) for the longer-run start probability used further ahead. */
  minutesLongHalfLife: 24,
  /** Per-GW decay of the short-run start signal towards the long-run one. */
  minutesReversion: 0.7,
  /** Half-life (GWs) for per-90 output rates. */
  rateHalfLife: 12,
  /** Half-life (GWs) for team attack/defence strength. */
  teamHalfLife: 40,
  /** Pseudo-fixtures of prior behind the start probability. */
  startPriorFixtures: 0.75,
  /** Pseudo-minutes of prior behind every per-90 rate. */
  ratePriorMinutes: 550,
  /** Share of last season's minutes/output counted alongside this season's. */
  lastSeasonWeight: 0.3,
  /** Pseudo-fixtures of price prior behind last season's start rate. */
  lastSeasonStartPrior: 3,
  /** Pseudo-matches of league-average prior behind team strengths. */
  teamPriorMatches: 3,
  /** Share of actual goals blended into the xG rate. */
  finishingWeight: 0,
  /** Share of actual FPL assists blended into the xA rate. */
  assistWeight: 0.2,
  /** FPL awards assists xA does not capture (penalties won, rebounds, deflections). */
  assistScale: 1.8,
  /** Shrinks expected goals against before P(clean sheet) = exp(-λ); xG is overdispersed. */
  cleanSheetLambdaScale: 0.95,
  /** Multiplier on the save rate. */
  savesScale: 1.2,
  /** Multiplier on xG for the home side (inverse for the away side). */
  homeAdvantage: 1.1,
  /** Average minutes of a substitute appearance. */
  subMinutes: 25,
  /**
   * Final calibration per position, fitted by least squares on 2023-24..2025-26:
   * points = scale × raw + perAppearance × appearance. Raw projections were
   * accurate for premiums but low for rotation players' cameo returns.
   */
  calibration: {
    GK: { scale: 0.78, perAppearance: 0.46 },
    DEF: { scale: 1.0, perAppearance: 0.03 },
    MID: { scale: 0.89, perAppearance: 0.35 },
    FWD: { scale: 0.83, perAppearance: 0.59 },
  } as Record<Pos, { scale: number; perAppearance: number }>,
};

export type ModelParams = typeof MODEL_PARAMS;

export interface PointsBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
  defcon: number;
  cards: number;
}

export interface PlayerProjection {
  id: number;
  /** Expected points for [nextGw, nextGw+1, ...]; 0 in a blank. */
  byGw: number[];
  /** Expected minutes per gameweek (summed over a double). */
  xMinsByGw: number[];
  pStart: number;
  /** Component breakdown for the next gameweek. */
  next: PointsBreakdown;
}

export interface ModelInput {
  players: ModelPlayer[];
  fixtures: ModelFixture[];
  nextGw: number;
  horizon: number;
  rules?: ScoringRules;
  params?: ModelParams;
  /** ISO deadline per GW; lets injury news ("Expected back 07 Nov") map to a GW. */
  deadlines?: Record<number, string>;
}

// ---- Priors fitted on 2023-24..2025-26 (players with 900+ minutes) ----
interface PriorRates { xg90: number; xa90: number; bonus90: number; saves90: number; yellow90: number; defconHit: number; startRate: number }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function priorRates(pos: Pos, price: number): PriorRates {
  switch (pos) {
    case 'GK':
      return { xg90: 0, xa90: 0.002, bonus90: 0.236, saves90: clamp(6.67 - 0.76 * price, 2.2, 3.6), yellow90: 0.06, defconHit: 0, startRate: clamp(-2.17 + 0.558 * price, 0.03, 0.9) };
    case 'DEF':
      return { xg90: clamp(-0.014 + 0.0143 * price, 0.02, 0.15), xa90: clamp(-0.10 + 0.0337 * price, 0.02, 0.2), bonus90: clamp(-0.31 + 0.110 * price, 0.08, 0.5), saves90: 0, yellow90: 0.18, defconHit: 0.27, startRate: clamp(-0.907 + 0.275 * price, 0.05, 0.9) };
    case 'MID':
      return { xg90: clamp(-0.176 + 0.0586 * price, 0.03, 0.6), xa90: clamp(-0.07 + 0.0345 * price, 0.03, 0.4), bonus90: clamp(-0.33 + 0.108 * price, 0.08, 0.9), saves90: 0, yellow90: 0.18, defconHit: 0.18, startRate: clamp(-0.377 + 0.124 * price, 0.05, 0.9) };
    case 'FWD':
      return { xg90: clamp(0.106 + 0.0484 * price, 0.2, 0.85), xa90: clamp(0.05 + 0.0034 * price, 0.04, 0.2), bonus90: clamp(0.24 + 0.056 * price, 0.3, 1.0), saves90: 0, yellow90: 0.15, defconHit: 0.01, startRate: clamp(-0.343 + 0.103 * price, 0.05, 0.9) };
  }
}

// ---- Poisson helpers ----
function poissonFloorDiv(lambda: number, d: number): number {
  // E[floor(X / d)] for X ~ Poisson(lambda)
  if (lambda <= 0) return 0;
  let p = Math.exp(-lambda);
  let cdfTail = 0;
  let e = 0;
  for (let k = 0; k < 40; k++) {
    if (k > 0) p *= lambda / k;
    cdfTail += p;
    e += Math.floor(k / d) * p;
    if (cdfTail > 0.999999 && k > lambda) break;
  }
  return e;
}

// ---- Team strength from xG for/against ----
export interface TeamRating { att: number; def: number }

export function teamRatings(
  players: ModelPlayer[],
  fixtures: ModelFixture[],
  beforeGw: number,
  params: ModelParams = MODEL_PARAMS
): { ratings: Map<number, TeamRating>; mean: number } {
  const xgf = new Map<string, number>();
  const xga = new Map<string, number>();
  for (const p of players) {
    for (const s of p.history) {
      if (s.gw >= beforeGw) continue;
      const key = `${s.team ?? p.team}:${s.gw}`;
      xgf.set(key, (xgf.get(key) ?? 0) + s.xg);
      // The player with the most xGC was on the pitch for (nearly) every minute.
      xga.set(key, Math.max(xga.get(key) ?? 0, s.xgc));
    }
  }
  const opponents = new Map<string, number[]>();
  const teams = new Set<number>();
  for (const f of fixtures) {
    teams.add(f.home);
    teams.add(f.away);
    if (f.gw >= beforeGw) continue;
    for (const [t, o] of [[f.home, f.away], [f.away, f.home]] as const) {
      const key = `${t}:${f.gw}`;
      const arr = opponents.get(key) ?? [];
      arr.push(o);
      opponents.set(key, arr);
    }
  }

  const weight = (gw: number) => Math.pow(0.5, (beforeGw - gw) / params.teamHalfLife);
  let sumF = 0;
  let sumN = 0;
  for (const [key, opps] of opponents) {
    const gw = Number(key.split(':')[1]);
    sumF += weight(gw) * (xgf.get(key) ?? 0);
    sumN += weight(gw) * opps.length;
  }
  const mean = sumN > 0 && sumF > 0 ? sumF / sumN : 1.35;

  const ratings = new Map<number, TeamRating>();
  for (const t of teams) ratings.set(t, { att: mean, def: mean });
  // Two passes of opponent adjustment: xG for is divided by the opponents'
  // defensive weakness and xG against by the opponents' attacking strength.
  for (let pass = 0; pass < 3; pass++) {
    const next = new Map<number, TeamRating>();
    for (const t of teams) {
      let f = 0, a = 0, nf = 0, na = 0, n = 0;
      for (const [key, opps] of opponents) {
        const [team, gwStr] = key.split(':');
        if (Number(team) !== t) continue;
        const w = weight(Number(gwStr));
        for (const o of opps) {
          const r = ratings.get(o) ?? { att: mean, def: mean };
          nf += w * (r.def / mean);
          na += w * (r.att / mean);
        }
        n += w * opps.length;
        f += w * (xgf.get(key) ?? 0);
        a += w * (xga.get(key) ?? 0);
      }
      const k = params.teamPriorMatches;
      const attRaw = nf > 0 ? f / nf : mean;
      const defRaw = na > 0 ? a / na : mean;
      next.set(t, {
        att: (attRaw * n + mean * k) / (n + k),
        def: (defRaw * n + mean * k) / (n + k),
      });
    }
    for (const [t, r] of next) ratings.set(t, r);
  }
  return { ratings, mean };
}

// ---- Availability from FPL status/news ----
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function returnDate(news: string | undefined, ref: Date): Date | null {
  if (!news) return null;
  const m = /(?:expected back|until|return(?:s|ing)? on)\s+(\d{1,2})\s+([A-Za-z]{3})/i.exec(news);
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (month == null) return null;
  const d = new Date(Date.UTC(ref.getUTCFullYear(), month, Number(m[1])));
  // News written in December about January refers to next year.
  if (d.getTime() < ref.getTime() - 60 * 24 * 3600 * 1000) d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Probability the player is available in GW nextGw + k. */
export function availability(p: ModelPlayer, k: number, gw: number, deadlines?: Record<number, string>): number {
  const status = p.status ?? 'a';
  if (status === 'a') return 1;
  if (status === 'u') return 0; // left the club or on loan elsewhere
  if (status === 'n') return k === 0 ? 0 : 1; // ineligible for one match (e.g. against a parent club)
  const deadline = deadlines?.[gw] ? new Date(deadlines[gw]!) : null;
  const back = deadline ? returnDate(p.news, deadline) : null;
  if (back && deadline) return deadline.getTime() >= back.getTime() ? 1 : 0;
  const chance = p.chanceNext ?? (status === 'd' ? 50 : 0);
  if (k === 0) return chance / 100;
  if (status === 's') return 1; // a typical ban is one match
  // Unknown recovery time: assume a gradual return over the following weeks.
  return clamp(chance / 100 + (k * 0.25), 0, 1);
}

// ---- Player rates ----
interface PlayerRates {
  pStart: number;
  pStartLong: number;
  minsPerStart: number;
  p60GivenStart: number;
  pSubApp: number;
  xg90: number;
  xa90: number;
  bonus90: number;
  saves90: number;
  yellow90: number;
  defconHit: number;
}

function estimateRates(
  p: ModelPlayer,
  beforeGw: number,
  teamFixtures: (team: number, gw: number) => number,
  rules: ScoringRules,
  params: ModelParams
): PlayerRates {
  const prior = priorRates(p.pos, p.price);
  const last = p.prior;
  if (last && last.fixtures > 0) {
    prior.startRate = (last.starts + prior.startRate * params.lastSeasonStartPrior) /
      (last.fixtures + params.lastSeasonStartPrior);
  }
  const wMin = (gw: number) => Math.pow(0.5, (beforeGw - gw - 1) / params.minutesHalfLife);
  const wLong = (gw: number) => Math.pow(0.5, (beforeGw - gw - 1) / params.minutesLongHalfLife);
  const wRate = (gw: number) => Math.pow(0.5, (beforeGw - gw - 1) / params.rateHalfLife);

  let sw = 0, sStart = 0, swL = 0, sStartL = 0;
  let swStart = 0, sMinsStart = 0, s60 = 0;
  let swNon = 0, sSub = 0;
  let rMins = 0, rXg = 0, rXa = 0, rBon = 0, rSv = 0, rYc = 0;
  let dcN = 0, dcHit = 0;

  for (const s of p.history) {
    if (s.gw >= beforeGw) continue;
    let nfx = teamFixtures(s.team ?? p.team, s.gw);
    if (nfx === 0) {
      if (s.minutes === 0) continue; // blank week
      nfx = 1;
    }
    const starts = Math.min(s.starts, nfx);
    const w = wMin(s.gw);
    sw += w * nfx;
    sStart += w * starts;
    swL += wLong(s.gw) * nfx;
    sStartL += wLong(s.gw) * starts;
    if (starts > 0) {
      swStart += w * starts;
      sMinsStart += w * Math.min(s.minutes, 90 * starts);
      if (s.minutes / starts >= 60) s60 += w * starts;
    }
    const nonStarts = nfx - starts;
    if (nonStarts > 0) {
      swNon += w * nonStarts;
      if (starts === 0 && s.minutes > 0) sSub += w * Math.min(nonStarts, 1);
    }

    const wr = wRate(s.gw);
    rMins += wr * s.minutes;
    rXg += wr * ((1 - params.finishingWeight) * s.xg + params.finishingWeight * s.goals);
    rXa += wr * ((1 - params.assistWeight) * s.xa * params.assistScale + params.assistWeight * s.assists);
    rBon += wr * s.bonus;
    rSv += wr * s.saves;
    rYc += wr * s.yellow;
    if (nfx === 1 && s.minutes >= 60) {
      dcN += wr;
      if (s.defcon >= rules.defconThreshold[p.pos]) dcHit += wr;
    }
  }

  if (last && last.minutes > 0) {
    // Last season enters as down-weighted extra minutes and output.
    const wp = params.lastSeasonWeight;
    rMins += wp * last.minutes;
    rXg += wp * ((1 - params.finishingWeight) * last.xg + params.finishingWeight * last.goals);
    rXa += wp * ((1 - params.assistWeight) * last.xa * params.assistScale + params.assistWeight * last.assists);
    rBon += wp * last.bonus;
    rSv += wp * last.saves;
    rYc += wp * last.yellow;
    dcN += wp * last.defconGames;
    dcHit += wp * last.defconHits;
  }

  const kS = params.startPriorFixtures;
  const M0 = params.ratePriorMinutes;
  const pStartLong = (sStartL + prior.startRate * kS) / (swL + kS);
  const rate = (sum: number, prior90: number) => ((sum + (prior90 * M0) / 90) / (rMins + M0)) * 90;
  return {
    pStart: (sStart + prior.startRate * kS) / (sw + kS),
    pStartLong,
    minsPerStart: (sMinsStart + 80 * 2) / (swStart + 2),
    p60GivenStart: (s60 + 0.88 * 2) / (swStart + 2),
    pSubApp: (sSub + 0.2 * 2) / (swNon + 2),
    xg90: rate(rXg, prior.xg90),
    xa90: rate(rXa, prior.xa90 * params.assistScale),
    bonus90: rate(rBon, prior.bonus90),
    saves90: rate(rSv, prior.saves90),
    yellow90: rate(rYc, prior.yellow90),
    defconHit: (dcHit + prior.defconHit * 4) / (dcN + 4),
  };
}

// ---- Fixture projection ----
function projectFixture(
  pos: Pos,
  r: PlayerRates,
  avail: number,
  team: TeamRating,
  opp: TeamRating,
  mean: number,
  isHome: boolean,
  rules: ScoringRules,
  params: ModelParams
): { pts: number; xMins: number; breakdown: PointsBreakdown } {
  const pStart = r.pStart * avail;
  const pSub = (1 - r.pStart) * r.pSubApp * avail;
  const xMins = pStart * r.minsPerStart + pSub * params.subMinutes;
  const pPlay = pStart + pSub;
  const p60 = pStart * r.p60GivenStart;

  const hfa = isHome ? params.homeAdvantage : 1 / params.homeAdvantage;
  const attackFactor = (opp.def / mean) * hfa;
  const concede = team.def * (opp.att / mean) / hfa;

  const goals = r.xg90 * (xMins / 90) * attackFactor * rules.goal[pos];
  const assists = r.xa90 * (xMins / 90) * attackFactor * rules.assist;
  const cleanSheet = p60 * Math.exp(-concede * params.cleanSheetLambdaScale) * rules.cleanSheet[pos];
  const goalsConceded = rules.goalsConceded[pos] * pPlay * poissonFloorDiv(concede * (xMins / Math.max(pPlay, 1e-6)) / 90, 2);
  const saves = pos === 'GK'
    ? pPlay * poissonFloorDiv(params.savesScale * r.saves90 * (xMins / Math.max(pPlay, 1e-6)) / 90 * (opp.att / mean) / hfa, 3)
    : 0;
  const bonus = r.bonus90 * (xMins / 90);
  const defcon = rules.defcon[pos] * p60 * r.defconHit;
  const cards = -r.yellow90 * (xMins / 90);
  const appearance = pPlay + p60;

  const { scale, perAppearance } = params.calibration[pos];
  const breakdown: PointsBreakdown = {
    appearance: appearance * (scale + perAppearance),
    goals: goals * scale,
    assists: assists * scale,
    cleanSheet: cleanSheet * scale,
    goalsConceded: goalsConceded * scale,
    saves: saves * scale,
    bonus: bonus * scale,
    defcon: defcon * scale,
    cards: cards * scale,
  };
  const pts = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return { pts, xMins, breakdown };
}

const ZERO: PointsBreakdown = { appearance: 0, goals: 0, assists: 0, cleanSheet: 0, goalsConceded: 0, saves: 0, bonus: 0, defcon: 0, cards: 0 };

export function projectAll(input: ModelInput): Map<number, PlayerProjection> {
  const rules = input.rules ?? DEFAULT_RULES;
  const params = input.params ?? MODEL_PARAMS;
  const { nextGw, horizon } = input;

  const fixturesByTeamGw = new Map<string, ModelFixture[]>();
  for (const f of input.fixtures) {
    for (const t of [f.home, f.away]) {
      const key = `${t}:${f.gw}`;
      const arr = fixturesByTeamGw.get(key) ?? [];
      arr.push(f);
      fixturesByTeamGw.set(key, arr);
    }
  }
  const teamFixtures = (team: number, gw: number) => fixturesByTeamGw.get(`${team}:${gw}`)?.length ?? 0;
  const { ratings, mean } = teamRatings(input.players, input.fixtures, nextGw, params);
  const rating = (t: number) => ratings.get(t) ?? { att: mean, def: mean };

  const out = new Map<number, PlayerProjection>();
  for (const p of input.players) {
    const base = estimateRates(p, nextGw, teamFixtures, rules, params);
    const byGw: number[] = [];
    const xMinsByGw: number[] = [];
    let next: PointsBreakdown = { ...ZERO };
    for (let k = 0; k < horizon; k++) {
      const gw = nextGw + k;
      const avail = availability(p, k, gw, input.deadlines);
      const blend = Math.pow(params.minutesReversion, k);
      const r = { ...base, pStart: base.pStartLong + (base.pStart - base.pStartLong) * blend };
      let pts = 0;
      let mins = 0;
      for (const f of fixturesByTeamGw.get(`${p.team}:${gw}`) ?? []) {
        const isHome = f.home === p.team;
        const res = projectFixture(p.pos, r, avail, rating(p.team), rating(isHome ? f.away : f.home), mean, isHome, rules, params);
        pts += res.pts;
        mins += res.xMins;
        if (k === 0) {
          for (const key of Object.keys(next) as Array<keyof PointsBreakdown>) next[key] += res.breakdown[key];
        }
      }
      byGw.push(pts);
      xMinsByGw.push(mins);
    }
    out.set(p.id, { id: p.id, byGw, xMinsByGw, pStart: base.pStart, next });
  }
  return out;
}
