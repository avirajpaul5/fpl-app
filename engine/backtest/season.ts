// Historical season data for backtests, from vaastav/Fantasy-Premier-League.
// Files are downloaded once into backtest/.cache (gitignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_RULES,
  type GwStat,
  type ModelFixture,
  type ModelPlayer,
  type Pos,
  type ReplayData,
  type ScoringRules,
  type SeasonPrior,
} from '../src/index.js';

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const BASE = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data';

/** Scoring before 2025-26: no defensive contributions, 6-point goalkeeper goals. */
export const PRE_2025_RULES: ScoringRules = {
  ...DEFAULT_RULES,
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  defcon: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]!);
  return lines.slice(1).map((line) => {
    const v = split(line);
    return Object.fromEntries(header.map((h, i) => [h, v[i] ?? '']));
  });
}

async function cachedCsv(season: string, file: string): Promise<Record<string, string>[]> {
  const path = join(CACHE, season, file.replace('/', '_'));
  if (!existsSync(path)) {
    const res = await fetch(`${BASE}/${season}/${file}`);
    if (!res.ok) throw new Error(`${season}/${file}: HTTP ${res.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, await res.text());
  }
  return parseCsv(readFileSync(path, 'utf-8'));
}

export interface WeekRow extends GwStat {
  team: number;
  /** Fixtures the player's club played that GW. */
  fixtures: number;
  price: number;
}

export interface HistPlayer {
  id: number;
  code: number;
  name: string;
  pos: Pos;
  weeks: Map<number, WeekRow>;
}

const POS: Record<string, Pos> = { GK: 'GK', GKP: 'GK', DEF: 'DEF', MID: 'MID', AM: 'MID', FWD: 'FWD' };
const num = (r: Record<string, string>, k: string) => Number(r[k]) || 0;

export class Season {
  readonly players = new Map<number, HistPlayer>();
  readonly fixtures: ModelFixture[];
  readonly maxGw: number;
  readonly rules: ScoringRules;
  prior = new Map<number, SeasonPrior>();
  /** First and last kickoff of each GW (ms). */
  readonly kickoffs = new Map<number, { first: number; last: number }>();

  constructor(readonly name: string, rows: Record<string, string>[], raw: Record<string, string>[], fixtureRows: Record<string, string>[]) {
    this.rules = name >= '2025-26' ? DEFAULT_RULES : PRE_2025_RULES;
    const code = new Map(raw.map((r) => [Number(r['id']), Number(r['code'])]));
    const fx = new Map(fixtureRows.map((f) => [Number(f['id']), f]));
    this.fixtures = fixtureRows
      .filter((f) => f['event'] && f['event'] !== 'None')
      .map((f) => ({ id: Number(f['id']), gw: Number(f['event']), home: Number(f['team_h']), away: Number(f['team_a']) }));
    for (const f of fixtureRows) {
      const gw = Number(f['event']);
      const t = Date.parse(f['kickoff_time'] ?? '');
      if (!gw || !Number.isFinite(t)) continue;
      const k = this.kickoffs.get(gw) ?? { first: t, last: t };
      this.kickoffs.set(gw, { first: Math.min(k.first, t), last: Math.max(k.last, t) });
    }
    let maxGw = 0;
    for (const r of rows) {
      const id = Number(r['element']);
      const gw = Number(r['GW'] ?? r['round']);
      const pos = POS[(r['position'] ?? '').toUpperCase()];
      const f = fx.get(Number(r['fixture']));
      if (!pos || !f || !gw) continue;
      maxGw = Math.max(maxGw, gw);
      const home = (r['was_home'] ?? '').toLowerCase() === 'true';
      let p = this.players.get(id);
      if (!p) {
        p = { id, code: code.get(id) ?? id, name: r['name'] ?? String(id), pos, weeks: new Map() };
        this.players.set(id, p);
      }
      const w = p.weeks.get(gw) ?? {
        gw, team: Number(home ? f['team_h'] : f['team_a']), fixtures: 0, price: num(r, 'value') / 10,
        minutes: 0, starts: 0, points: 0, xg: 0, xa: 0, xgc: 0, goals: 0, assists: 0, saves: 0, bonus: 0, defcon: 0, yellow: 0, red: 0,
      };
      w.fixtures++;
      w.minutes += num(r, 'minutes');
      w.starts += num(r, 'starts');
      w.points += num(r, 'total_points');
      w.xg += num(r, 'expected_goals');
      w.xa += num(r, 'expected_assists');
      w.xgc += num(r, 'expected_goals_conceded');
      w.goals += num(r, 'goals_scored');
      w.assists += num(r, 'assists');
      w.saves += num(r, 'saves');
      w.bonus += num(r, 'bonus');
      w.defcon += num(r, 'defensive_contribution');
      w.yellow += num(r, 'yellow_cards');
      w.red += num(r, 'red_cards');
      p.weeks.set(gw, w);
    }
    this.maxGw = maxGw;
  }

  /** Latest known row at or before gw (price/club at a deadline). */
  rowAt(p: HistPlayer, gw: number): WeekRow | undefined {
    for (let g = gw; g >= 1; g--) if (p.weeks.has(g)) return p.weeks.get(g);
    for (let g = gw + 1; g <= this.maxGw; g++) if (p.weeks.has(g)) return p.weeks.get(g);
    return undefined;
  }

  /** FPL deadlines fall 90 minutes before a gameweek's first kickoff. */
  deadline(gw: number): number {
    return (this.kickoffs.get(gw)?.first ?? Infinity) - 90 * 60 * 1000;
  }

  /** Gameweeks whose every match was over before the `gw` deadline. */
  knownBefore(gw: number): Set<number> {
    const known = new Set<number>();
    for (const [h, k] of this.kickoffs) {
      if (h < gw && k.last + 2.5 * 60 * 60 * 1000 <= this.deadline(gw)) known.add(h);
    }
    return known;
  }

  /** Model inputs as they stood at the GW deadline (no injury news is archived). */
  modelPlayers(gw: number): ModelPlayer[] {
    const known = this.knownBefore(gw);
    const out: ModelPlayer[] = [];
    for (const p of this.players.values()) {
      const at = this.rowAt(p, gw);
      if (!at) continue;
      out.push({
        id: p.id,
        pos: p.pos,
        team: at.team,
        price: at.price,
        history: [...p.weeks.values()].filter((w) => known.has(w.gw)),
        prior: this.prior.get(p.code),
      });
    }
    return out;
  }

  /** This season's totals per player code, to serve as next season's prior. */
  priors(): Map<number, SeasonPrior> {
    // 2022-23 only published xG and starts from GW16.
    const firstGw = this.name === '2022-23' ? 16 : 1;
    const out = new Map<number, SeasonPrior>();
    for (const p of this.players.values()) {
      const t: SeasonPrior = { minutes: 0, starts: 0, fixtures: 0, xg: 0, xa: 0, goals: 0, assists: 0, bonus: 0, saves: 0, yellow: 0, defconGames: 0, defconHits: 0 };
      for (const w of p.weeks.values()) {
        if (w.gw < firstGw) continue;
        t.minutes += w.minutes; t.starts += w.starts; t.fixtures += w.fixtures;
        t.xg += w.xg; t.xa += w.xa; t.goals += w.goals; t.assists += w.assists;
        t.bonus += w.bonus; t.saves += w.saves; t.yellow += w.yellow;
        if (this.rules.defcon.DEF > 0 && w.fixtures === 1 && w.minutes >= 60 && p.pos !== 'GK') {
          t.defconGames++;
          if (w.defcon >= this.rules.defconThreshold[p.pos]) t.defconHits++;
        }
      }
      out.set(p.code, t);
    }
    return out;
  }

  replayData(): ReplayData {
    return {
      pos: (id) => this.players.get(id)?.pos ?? 'MID',
      actual: (id, gw) => {
        const w = this.players.get(id)?.weeks.get(gw);
        return w ? { pts: w.points, mins: w.minutes } : { pts: 0, mins: 0 };
      },
      price: (id, gw) => {
        const p = this.players.get(id);
        return (p && this.rowAt(p, gw)?.price) ?? 4.5;
      },
    };
  }
}

export async function loadSeason(name: string): Promise<Season> {
  const [rows, raw, fixtures] = await Promise.all([
    cachedCsv(name, 'gws/merged_gw.csv'),
    cachedCsv(name, 'players_raw.csv'),
    cachedCsv(name, 'fixtures.csv'),
  ]);
  return new Season(name, rows, raw, fixtures);
}

const PREVIOUS: Record<string, string> = { '2023-24': '2022-23', '2024-25': '2023-24', '2025-26': '2024-25', '2026-27': '2025-26' };

/** Load a season with last season's totals attached as priors. */
export async function loadSeasonWithPrior(name: string): Promise<Season> {
  const season = await loadSeason(name);
  const prev = PREVIOUS[name];
  if (prev) season.prior = (await loadSeason(prev)).priors();
  return season;
}
