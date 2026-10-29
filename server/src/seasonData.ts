import {
  DEFAULT_RULES,
  attachProjections,
  projectAll,
  type GwStat,
  type ModelFixture,
  type ModelPlayer,
  type Player,
  type Pos,
  type ProjectedPlayer,
  type ScoringRules,
  type SeasonPrior,
} from '@fpl/engine';
import { PRIOR_TOTALS } from './priorData.js';
import { cacheGet, cacheSet } from './cache.js';
import {
  fetchAllFixtures,
  fetchBootstrap,
  fetchEventLive,
  fetchNormalizedPlayers,
  getCurrentGw,
  normalizePos,
  type RawBootstrap,
  type RawElement,
  type RawFixture,
} from './fplClient.js';

/** Gameweeks projected ahead (transfers use the first five, chips look further). */
export const PROJECTION_HORIZON = 8;

export interface SeasonData {
  bootstrap: RawBootstrap;
  fixtures: RawFixture[];
  nextGw: number;
  finishedGws: number[];
  deadlines: Record<number, string>;
  /** Per-player stats for every finished GW, keyed by element id. */
  history: Map<number, GwStat[]>;
  elements: Map<number, RawElement>;
}

export async function loadSeasonData(): Promise<SeasonData> {
  const [bootstrap, fixtures, nextGw] = await Promise.all([fetchBootstrap(), fetchAllFixtures(), getCurrentGw()]);
  const finishedGws = bootstrap.events.filter((e) => e.finished).map((e) => e.id).sort((a, b) => a - b);
  const key = `season-history:${finishedGws.join(',')}`;
  let history = cacheGet<Map<number, GwStat[]>>(key);
  if (!history) {
    const lives = await Promise.all(finishedGws.map((gw) => fetchEventLive(gw, true)));
    history = new Map();
    lives.forEach((live, i) => {
      const gw = finishedGws[i]!;
      for (const el of live.elements) {
        const s = el.stats;
        const rows = history!.get(el.id) ?? [];
        rows.push({
          gw,
          minutes: s.minutes,
          starts: s.starts ?? (s.minutes >= 60 ? 1 : 0),
          points: s.total_points,
          xg: parseFloat(s.expected_goals) || 0,
          xa: parseFloat(s.expected_assists) || 0,
          xgc: parseFloat(s.expected_goals_conceded) || 0,
          goals: s.goals_scored,
          assists: s.assists,
          saves: s.saves,
          bonus: s.bonus,
          defcon: s.defensive_contribution ?? 0,
          yellow: s.yellow_cards,
          red: s.red_cards,
        });
        history!.set(el.id, rows);
      }
    });
    cacheSet(key, history, 24 * 60 * 60 * 1000);
  }
  const deadlines = Object.fromEntries(bootstrap.events.map((e) => [e.id, e.deadline_time]));
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  return { bootstrap, fixtures, nextGw, finishedGws, deadlines, history, elements };
}

/** This season's scoring rules from the bootstrap, falling back to the defaults. */
export function scoringRules(bootstrap: RawBootstrap): ScoringRules {
  const s = bootstrap.game_config?.scoring;
  if (!s) return DEFAULT_RULES;
  const byPos = (v: unknown, fallback: Record<Pos, number>): Record<Pos, number> => {
    if (!v || typeof v !== 'object') return fallback;
    const o = v as Record<string, number>;
    return { GK: o['GKP'] ?? fallback.GK, DEF: o['DEF'] ?? fallback.DEF, MID: o['MID'] ?? fallback.MID, FWD: o['FWD'] ?? fallback.FWD };
  };
  return {
    ...DEFAULT_RULES,
    goal: byPos(s['goals_scored'], DEFAULT_RULES.goal),
    assist: typeof s['assists'] === 'number' ? s['assists'] : DEFAULT_RULES.assist,
    cleanSheet: byPos(s['clean_sheets'], DEFAULT_RULES.cleanSheet),
    goalsConceded: byPos(s['goals_conceded'], DEFAULT_RULES.goalsConceded),
    defcon: byPos(s['defensive_contribution'], DEFAULT_RULES.defcon),
  };
}

export function modelFixtures(fixtures: RawFixture[]): ModelFixture[] {
  return fixtures
    .filter((f) => f.event != null)
    .map((f) => ({ id: f.id, gw: f.event!, home: f.team_h, away: f.team_a }));
}

/** Price at the start of the season (FPL exposes the net change since then). */
export function startPrice(el: RawElement): number {
  return (el.now_cost - (el.cost_change_start ?? 0)) / 10;
}

/**
 * Approximate price at a past deadline. FPL's public API has no price history,
 * so prices are interpolated between the season-start and current price.
 */
export function priceAt(el: RawElement, gw: number, nowGw: number): number {
  const start = startPrice(el);
  const now = el.now_cost / 10;
  if (gw >= nowGw || nowGw <= 1) return now;
  const t = Math.max(0, gw - 1) / (nowGw - 1);
  return Math.round((start + (now - start) * t) * 10) / 10;
}

/** Last season's totals for a player (by FPL's persistent code), if he played in the league. */
export function seasonPrior(code: number | undefined): SeasonPrior | undefined {
  const t = code != null ? PRIOR_TOTALS[code] : undefined;
  if (!t) return undefined;
  const [minutes, starts, fixtures, xg, xa, goals, assists, bonus, saves, yellow, defconGames, defconHits] = t as [
    number, number, number, number, number, number, number, number, number, number, number, number,
  ];
  return { minutes, starts, fixtures, xg, xa, goals, assists, bonus, saves, yellow, defconGames, defconHits };
}

export function modelPlayers(
  data: SeasonData,
  beforeGw: number,
  opts: { withStatus: boolean; price?: (el: RawElement) => number }
): ModelPlayer[] {
  const out: ModelPlayer[] = [];
  for (const el of data.bootstrap.elements) {
    const pos = normalizePos(el.element_type);
    if (!pos) continue;
    out.push({
      id: el.id,
      pos,
      team: el.team,
      price: opts.price ? opts.price(el) : el.now_cost / 10,
      history: (data.history.get(el.id) ?? []).filter((s) => s.gw < beforeGw),
      prior: seasonPrior(el.code),
      ...(opts.withStatus ? { status: el.status, chanceNext: el.chance_of_playing_next_round, news: el.news } : {}),
    });
  }
  return out;
}

/** Projections for the upcoming deadline, using live injury/availability news. */
export async function getProjectedPlayers(): Promise<{ gw: number; players: ProjectedPlayer[]; data: SeasonData }> {
  const data = await loadSeasonData();
  const key = `projected:${data.nextGw}:${data.finishedGws.length}`;
  const hit = cacheGet<ProjectedPlayer[]>(key);
  if (hit) return { gw: data.nextGw, players: hit, data };
  const display = await fetchNormalizedPlayers(data.nextGw);
  const projections = projectAll({
    players: modelPlayers(data, data.nextGw, { withStatus: true }),
    fixtures: modelFixtures(data.fixtures),
    nextGw: data.nextGw,
    horizon: PROJECTION_HORIZON,
    rules: scoringRules(data.bootstrap),
    deadlines: data.deadlines,
  });
  const players = attachProjections(display, projections, PROJECTION_HORIZON);
  cacheSet(key, players, 15 * 60 * 1000);
  return { gw: data.nextGw, players, data };
}

/**
 * Projections exactly as the engine would have made them at a past deadline:
 * only results before that GW, no injury news (it is not archived), and
 * interpolated prices.
 */
export function projectAtDeadline(data: SeasonData, display: Player[], gw: number): ProjectedPlayer[] {
  const price = (el: RawElement) => priceAt(el, gw, data.nextGw);
  const projections = projectAll({
    players: modelPlayers(data, gw, { withStatus: false, price }),
    fixtures: modelFixtures(data.fixtures),
    nextGw: gw,
    horizon: PROJECTION_HORIZON,
    rules: scoringRules(data.bootstrap),
  });
  const atDeadline = display.map((p) => {
    const el = data.elements.get(p.id);
    return el ? { ...p, price: price(el), status: 'a', chanceNext: null, news: undefined } : p;
  });
  return attachProjections(atDeadline, projections, PROJECTION_HORIZON);
}
