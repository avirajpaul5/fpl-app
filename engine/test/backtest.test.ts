/**
 * Backtest harness — validates engine logic against historical FPL data.
 *
 * Data source: Vaastav's FPL dataset
 *   merged_gw.csv: https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/{season}/gws/merged_gw.csv
 *   fixtures.csv:  https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/{season}/fixtures.csv
 *
 * The historical per-GW xP column is named `xP` (archived ep_next).
 *
 * This test suite is structured to use small sample fixtures for CI speed.
 * For full backtest, set FULL_BACKTEST=1 and ensure the CSV files are present.
 * BACKTEST_FIXTURES_DIR may point at an external directory with season folders.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ENGINE_CONFIG,
  draftSquad,
  validateSquad,
  bestXI,
  pickCaptain,
  planTransfers,
  evaluateChips,
} from '../src/index.js';
import type { Player, ProjectedPlayer, Squad } from '../src/index.js';
import {
  MULTI_GW_BASELINE_BLEND,
  MULTI_GW_BLEND,
  expectedAttackingPointsRate,
  multiGwBasePoints,
  projectPlayer,
  projectPlayers,
} from '../src/projection.js';
import type { MultiGwBlend, MultiGwSignals } from '../src/projection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = process.env['BACKTEST_FIXTURES_DIR'] ?? join(__dirname, 'fixtures');
const RUN_FULL_BACKTEST = process.env['FULL_BACKTEST'] === '1';

// ---- CSV parser ----
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim().replace(/^"|"$/g, '');
    });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  // Simple CSV split respecting quoted fields
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += char;
  }
  result.push(current);
  return result;
}

// ---- Spearman rank correlation ----
function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;

  function rank(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const ranks = new Array(n).fill(0);
    for (let start = 0; start < n;) {
      let end = start + 1;
      while (end < n && indexed[end]!.v === indexed[start]!.v) end++;
      const averageRank = (start + end - 1) / 2 + 1;
      for (let i = start; i < end; i++) ranks[indexed[i]!.i] = averageRank;
      start = end;
    }
    return ranks;
  }

  const rx = rank(xs);
  const ry = rank(ys);
  const meanX = rx.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ry.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i]! - meanX;
    const dy = ry[i]! - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}

// ---- Squad legality tests (use sample data) ----
describe('Squad legality', () => {
  function makeSamplePlayers(n = 15): Player[] {
    const positions = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'] as const;
    return Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `Player${i + 1}`,
      pos: positions[i]!,
      team: (i % 5) + 1,
      teamName: `Team${(i % 5) + 1}`,
      price: 5.0 + (i % 3) * 0.5,
      epNext: Math.random() * 8,
      ppg: 4 + Math.random() * 3,
      form: 3 + Math.random() * 4,
      expectedGoals: 2 + Math.random() * 4,
      expectedAssists: 1 + Math.random() * 3,
      minutes: 900,
      ownership: 10 + Math.random() * 30,
      status: 'a',
      chanceNext: 100,
      totalPoints: 50 + Math.floor(Math.random() * 100),
      upcoming: Array.from({ length: 5 }, (_, k) => ({
        gw: k + 1,
        oppTeam: ((k + 1) % 20) + 1,
        isHome: k % 2 === 0,
        fdr: (k % 5) + 1,
        isDGW: k === 3,
      })),
    }));
  }

  it('validateSquad rejects wrong size', () => {
    const result = validateSquad({ players: makeSamplePlayers(14) });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('15'))).toBe(true);
  });

  it('validateSquad accepts legal squad', () => {
    const squad = { players: makeSamplePlayers(15) };
    const result = validateSquad(squad);
    expect(result.ok).toBe(true);
  });

  it('validateSquad rejects club cap violation', () => {
    const players = makeSamplePlayers(15);
    // Force 4 players from team 1
    players[0]!.team = 1;
    players[1]!.team = 1;
    players[2]!.team = 1;
    players[3]!.team = 1;
    const result = validateSquad({ players });
    expect(result.ok).toBe(false);
  });

  it('bestXI returns exactly 11 starters', () => {
    const squad = { players: makeSamplePlayers(15) };
    const xi = bestXI(squad);
    expect(xi.starters.length).toBe(11);
  });

  it('bestXI returns an ordered four-player bench with the reserve goalkeeper last', () => {
    const xi = bestXI({ players: makeSamplePlayers(15) });
    expect(xi.bench).toHaveLength(4);
    expect(xi.bench[3]?.pos).toBe('GK');
    expect(xi.bench.slice(0, 3).every((player) => player.pos !== 'GK')).toBe(true);
  });

  it('suppresses advice for a chip with no uses remaining', () => {
    const squad = { players: makeSamplePlayers(15) };
    const advice = evaluateChips(squad, 1, {
      gw: 1,
      blankCountsByGw: {},
      dgwCountsByGw: {},
      totalGws: 38,
      allPlayers: projectPlayers(squad.players),
    }, { benchBoost: 0 });

    expect(advice.benchBoost.recommend).toBe(false);
    expect(advice.benchBoost.reason).toContain('No uses remaining');
  });

  it('keeps advice active when one chip use remains', () => {
    const squad = { players: makeSamplePlayers(15) };
    const advice = evaluateChips(squad, 1, {
      gw: 1,
      blankCountsByGw: {},
      dgwCountsByGw: {},
      totalGws: 38,
      allPlayers: projectPlayers(squad.players),
    }, { benchBoost: 1 });

    expect(advice.benchBoost.recommend).toBe(true);
  });

  it('bestXI GK count is exactly 1', () => {
    const squad = { players: makeSamplePlayers(15) };
    const xi = bestXI(squad);
    expect(xi.starters.filter((p) => p.pos === 'GK').length).toBe(1);
  });

  it('bestXI DEF count is between 3 and 5', () => {
    const squad = { players: makeSamplePlayers(15) };
    const xi = bestXI(squad);
    const defCount = xi.starters.filter((p) => p.pos === 'DEF').length;
    expect(defCount).toBeGreaterThanOrEqual(3);
    expect(defCount).toBeLessThanOrEqual(5);
  });

  it('bestXI captain has highest projected xP', () => {
    const squad = { players: makeSamplePlayers(15) };
    const xi = bestXI(squad);
    const captainXp = projectPlayer(xi.captain, 1).projByGw[0] ?? 0;
    for (const s of xi.starters) {
      const xp = projectPlayer(s, 1).projByGw[0] ?? 0;
      expect(captainXp).toBeGreaterThanOrEqual(xp - 0.001);
    }
  });

  it('prefers an attacker when captain candidates have equal next-GW xP', () => {
    const tied = makeSamplePlayers(15).slice(0, 4);
    tied.forEach((player) => { player.epNext = 4; });
    tied[0]!.pos = 'GK';
    tied[1]!.pos = 'DEF';
    tied[2]!.pos = 'MID';
    tied[3]!.pos = 'FWD';

    const pick = pickCaptain(tied);

    expect(pick.captain.pos).toBe('FWD');
    expect(pick.viceCaptain.pos).toBe('MID');
  });
});

// ---- draftSquad tests ----
describe('draftSquad', () => {
  function makeLargePlayers(n = 200): ProjectedPlayer[] {
    const posDistribution = ['GK', 'GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD'] as const;

    return Array.from({ length: n }, (_, i) => {
      const pos = posDistribution[i % posDistribution.length]!;
      const projByGw = Array.from({ length: 5 }, () => 3 + Math.random() * 6);
      const projHorizon = projByGw.reduce((s, v) => s + v, 0);
      return {
        id: i + 1,
        name: `Player${i + 1}`,
        pos,
        team: (i % 20) + 1,
        teamName: `Team${(i % 20) + 1}`,
        price: 4.0 + (i % 10) * 0.5,
        epNext: 3 + Math.random() * 6,
        ppg: 3 + Math.random() * 5,
        form: 2 + Math.random() * 5,
        expectedGoals: 2 + Math.random() * 5,
        expectedAssists: 1 + Math.random() * 4,
        minutes: 900,
        ownership: 5 + Math.random() * 50,
        status: 'a',
        chanceNext: 100,
        totalPoints: 50 + Math.floor(Math.random() * 150),
        upcoming: Array.from({ length: 5 }, (_, k) => ({
          gw: k + 1,
          oppTeam: ((k + i + 1) % 20) + 1,
          isHome: (k + i) % 2 === 0,
          fdr: ((k + i) % 5) + 1,
          isDGW: false,
        })),
        projByGw,
        projHorizon,
      };
    });
  }

  it('produces exactly 15 players', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    expect(squad.players.length).toBe(15);
  });

  it('produces a legal squad (passes validateSquad)', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    const result = validateSquad(squad);
    expect(result.ok).toBe(true);
  });

  it('respects position quotas', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of squad.players) counts[p.pos]++;
    expect(counts.GK).toBe(2);
    expect(counts.DEF).toBe(5);
    expect(counts.MID).toBe(5);
    expect(counts.FWD).toBe(3);
  });

  it('respects club cap (≤3 per club)', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    const clubCounts: Record<number, number> = {};
    for (const p of squad.players) {
      clubCounts[p.team] = (clubCounts[p.team] ?? 0) + 1;
    }
    for (const count of Object.values(clubCounts)) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('stays within £100m budget', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    const total = squad.players.reduce((s, p) => s + p.price, 0);
    expect(total).toBeLessThanOrEqual(100.001);
  });

  it('compares by player.id (no duplicate players)', () => {
    const players = makeLargePlayers();
    const squad = draftSquad(players);
    const ids = squad.players.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(15);
  });
});

// ---- Transfer planner tests ----
describe('planTransfers', () => {
  it('uses exact bank and selling price for affordability', () => {
    const makeProjected = (id: number, price: number, horizon: number): ProjectedPlayer => ({
      id,
      name: `P${id}`,
      pos: 'MID',
      team: id,
      teamName: `T${id}`,
      price,
      epNext: horizon / 5,
      ppg: horizon / 5,
      form: horizon / 5,
      expectedGoals: 0,
      expectedAssists: 0,
      minutes: 0,
      ownership: 10,
      status: 'a',
      chanceNext: 100,
      totalPoints: 100,
      upcoming: [],
      projByGw: Array.from({ length: 5 }, () => horizon / 5),
      projHorizon: horizon,
    });
    const owned = makeProjected(1, 6, 20);
    const incoming = makeProjected(2, 6, 30);

    const blocked = planTransfers({ players: [owned] }, [owned, incoming], 1, {
      bank: 0.5,
      sellingPrices: { 1: 5 },
    });
    expect(blocked.moves).toHaveLength(0);

    const affordable = planTransfers({ players: [owned] }, [owned, incoming], 1, {
      bank: 1,
      sellingPrices: { 1: 5 },
    });
    expect(affordable.moves[0]?.outSellingPrice).toBe(5);
  });

  it('recommends bank when no good transfer exists', () => {
    // Create a squad where all replacements project similarly
    const makePlayer = (id: number, pos: 'GK' | 'DEF' | 'MID' | 'FWD', price: number, projHorizon = 20): ProjectedPlayer => ({
      id,
      name: `Player${id}`,
      pos,
      team: id % 20,
      teamName: `T${id % 20}`,
      price,
      epNext: projHorizon / 5,
      ppg: projHorizon / 5,
      form: projHorizon / 5,
      expectedGoals: 0,
      expectedAssists: 0,
      minutes: 0,
      ownership: 10,
      status: 'a',
      chanceNext: 100,
      totalPoints: 100,
      upcoming: Array.from({ length: 5 }, (_, k) => ({ gw: k + 1, oppTeam: k + 2, isHome: true, fdr: 3, isDGW: false })),
      projByGw: Array.from({ length: 5 }, () => projHorizon / 5),
      projHorizon,
    });

    const squad: Squad = {
      players: [
        makePlayer(1, 'GK', 4.5), makePlayer(2, 'GK', 4.0),
        makePlayer(3, 'DEF', 5.0), makePlayer(4, 'DEF', 5.0), makePlayer(5, 'DEF', 5.0),
        makePlayer(6, 'DEF', 4.5), makePlayer(7, 'DEF', 4.5),
        makePlayer(8, 'MID', 6.0), makePlayer(9, 'MID', 6.0), makePlayer(10, 'MID', 6.0),
        makePlayer(11, 'MID', 5.5), makePlayer(12, 'MID', 5.0),
        makePlayer(13, 'FWD', 6.5), makePlayer(14, 'FWD', 6.0), makePlayer(15, 'FWD', 5.5),
      ],
    };

    // All available players project to same value — no gain
    const allPlayers = [...squad.players].map((p) => ({ ...p, id: p.id + 100 }));

    const plan = planTransfers(squad, allPlayers, 1);
    expect(plan.recommendation).toBe('bank');
    expect(plan.moves.length).toBe(0);
  });

  it('never takes a hit for gain ≤4', () => {
    // Players in squad all project 20 pts horizon
    // Best replacement projects 23 pts (gain = 3) — below hit threshold of 4
    const makePlayer = (id: number, pos: 'GK' | 'DEF' | 'MID' | 'FWD', price: number, projHorizon: number): ProjectedPlayer => ({
      id,
      name: `P${id}`,
      pos,
      team: (id % 18) + 1,
      teamName: `T${id}`,
      price,
      epNext: projHorizon / 5,
      ppg: projHorizon / 5,
      form: projHorizon / 5,
      expectedGoals: 0,
      expectedAssists: 0,
      minutes: 0,
      ownership: 5,
      status: 'a',
      chanceNext: 100,
      totalPoints: 80,
      upcoming: Array.from({ length: 5 }, (_, k) => ({ gw: k + 1, oppTeam: k + 5, isHome: true, fdr: 3, isDGW: false })),
      projByGw: Array.from({ length: 5 }, () => projHorizon / 5),
      projHorizon,
    });

    const squad: Squad = {
      players: [
        makePlayer(1, 'GK', 4.5, 20), makePlayer(2, 'GK', 4.0, 20),
        makePlayer(3, 'DEF', 5.0, 20), makePlayer(4, 'DEF', 5.0, 20), makePlayer(5, 'DEF', 5.0, 20),
        makePlayer(6, 'DEF', 4.5, 20), makePlayer(7, 'DEF', 4.5, 20),
        makePlayer(8, 'MID', 6.0, 20), makePlayer(9, 'MID', 6.0, 20), makePlayer(10, 'MID', 6.0, 20),
        makePlayer(11, 'MID', 5.5, 20), makePlayer(12, 'MID', 5.0, 20),
        makePlayer(13, 'FWD', 6.5, 20), makePlayer(14, 'FWD', 6.0, 20), makePlayer(15, 'FWD', 5.5, 20),
      ],
    };

    // Replacements project 23 (gain=3, below 4 hit threshold)
    const replacements: ProjectedPlayer[] = [
      makePlayer(101, 'GK', 4.5, 23),
      makePlayer(102, 'DEF', 5.0, 23),
      makePlayer(103, 'MID', 6.0, 23),
      makePlayer(104, 'FWD', 6.5, 23),
    ];

    // With 0 free transfers, all moves cost a hit — gain=3 is below HIT_MIN_GAIN=4
    const plan = planTransfers(squad, [...squad.players, ...replacements], 0);
    expect(plan.hitsTaken).toBe(0);
  });
});

// ---- projection.ts k=0 = ep_next ----
describe('projection k=0', () => {
  it('projByGw[0] for available player equals ep_next', () => {
    const player: Player = {
      id: 1, name: 'Test', pos: 'MID', team: 1, teamName: 'Arsenal',
      price: 8.0, epNext: 7.5, ppg: 6.0, form: 6.5, ownership: 20,
      expectedGoals: 5, expectedAssists: 4, minutes: 900,
      status: 'a', chanceNext: 100, totalPoints: 120,
      upcoming: [{ gw: 1, oppTeam: 2, isHome: true, fdr: 3, isDGW: false }],
    };
    const projected = projectPlayer(player, 1);
    expect(projected.projByGw[0]).toBeCloseTo(7.5, 3);
  });

  it('availability multiplier gates injured player at k=0', () => {
    const player: Player = {
      id: 2, name: 'Injured', pos: 'FWD', team: 2, teamName: 'Chelsea',
      price: 9.0, epNext: 8.0, ppg: 7.0, form: 7.0, ownership: 30,
      expectedGoals: 8, expectedAssists: 2, minutes: 900,
      status: 'i', chanceNext: null, totalPoints: 100,
      upcoming: [{ gw: 1, oppTeam: 3, isHome: false, fdr: 4, isDGW: false }],
    };
    const projected = projectPlayer(player, 1);
    expect(projected.projByGw[0]).toBe(0);
  });

  it('50% chance player is halved at k=0', () => {
    const player: Player = {
      id: 3, name: 'Doubtful50', pos: 'DEF', team: 3, teamName: 'Spurs',
      price: 6.0, epNext: 4.0, ppg: 4.0, form: 4.0, ownership: 15,
      expectedGoals: 1, expectedAssists: 2, minutes: 900,
      status: 'd', chanceNext: 50, totalPoints: 80,
      upcoming: [{ gw: 1, oppTeam: 4, isHome: true, fdr: 2, isDGW: false }],
    };
    const projected = projectPlayer(player, 1);
    expect(projected.projByGw[0]).toBeCloseTo(2.0, 3);
  });
});

describe('multi-GW expected-stat blend', () => {
  const signals: MultiGwSignals = {
    pos: 'MID',
    ppg: 5,
    form: 4,
    expectedGoals: 2,
    expectedAssists: 1,
    minutes: 900,
  };

  it('values xG and xA using position-specific FPL points', () => {
    expect(expectedAttackingPointsRate(signals)).toBeCloseTo(1.3, 5);
  });

  it('uses the backtest-winning 60/20/20 blend', () => {
    expect(multiGwBasePoints(signals)).toBeCloseTo(4.06, 5);
  });

  it('shrinks expected-stat rates until 450 minutes', () => {
    expect(expectedAttackingPointsRate({
      ...signals,
      expectedGoals: 1,
      expectedAssists: 0,
      minutes: 90,
    })).toBeCloseTo(1, 5);
  });

  it('falls back to form before expected-stat history exists', () => {
    expect(expectedAttackingPointsRate({ ...signals, minutes: 0 })).toBe(signals.form);
  });
});

interface HistoricalGwStats {
  points: number;
  minutes: number;
  expectedGoals: number;
  expectedAssists: number;
  fixtures: Array<{ id: number; isHome: boolean }>;
}

interface HistoricalPlayer {
  pos: Player['pos'];
  byGw: Map<number, HistoricalGwStats>;
}

interface MultiGwBacktestSample extends MultiGwSignals {
  actualNextFour: number;
  projectionFactor: number;
}

function historicalPos(label: string): Player['pos'] {
  const normalized = label.toUpperCase();
  if (normalized === 'GK' || normalized === 'GKP') return 'GK';
  if (normalized === 'DEF') return 'DEF';
  if (normalized === 'MID') return 'MID';
  return 'FWD';
}

function buildMultiGwSamples(
  rows: Record<string, string>[],
  fixtureRows: Record<string, string>[]
): MultiGwBacktestSample[] {
  const fixtureDifficulties = new Map(
    fixtureRows.map((row) => [
      Number(row['id']),
      {
        home: Number(row['team_h_difficulty']),
        away: Number(row['team_a_difficulty']),
      },
    ])
  );
  const players = new Map<number, HistoricalPlayer>();
  let maxGw = 0;

  for (const row of rows) {
    const id = Number(row['element']);
    const gw = Number(row['GW'] ?? row['round']);
    if (!Number.isFinite(id) || !Number.isFinite(gw)) continue;
    maxGw = Math.max(maxGw, gw);

    let player = players.get(id);
    if (!player) {
      player = { pos: historicalPos(row['position'] ?? ''), byGw: new Map() };
      players.set(id, player);
    }

    const stats = player.byGw.get(gw) ?? {
      points: 0,
      minutes: 0,
      expectedGoals: 0,
      expectedAssists: 0,
      fixtures: [],
    };
    stats.points += Number(row['total_points']) || 0;
    stats.minutes += Number(row['minutes']) || 0;
    stats.expectedGoals += Number(row['expected_goals']) || 0;
    stats.expectedAssists += Number(row['expected_assists']) || 0;
    stats.fixtures.push({
      id: Number(row['fixture']),
      isHome: row['was_home']?.toLowerCase() === 'true',
    });
    player.byGw.set(gw, stats);
  }

  const samples: MultiGwBacktestSample[] = [];
  for (const player of players.values()) {
    let totalPoints = 0;
    let totalMinutes = 0;
    let totalExpectedGoals = 0;
    let totalExpectedAssists = 0;
    let appearances = 0;
    const recent: HistoricalGwStats[] = [];

    for (let gw = 1; gw <= maxGw - 4; gw++) {
      const stats = player.byGw.get(gw) ?? {
        points: 0,
        minutes: 0,
        expectedGoals: 0,
        expectedAssists: 0,
        fixtures: [],
      };
      if (stats.minutes > 0) appearances++;
      totalPoints += stats.points;
      totalMinutes += stats.minutes;
      totalExpectedGoals += stats.expectedGoals;
      totalExpectedAssists += stats.expectedAssists;
      recent.push(stats);
      if (recent.length > 4) recent.shift();

      // Avoid judging season-rate signals on players without a useful sample.
      if (gw < 5 || appearances < 3 || totalMinutes < 180) continue;

      const recentAppearances = recent.filter((item) => item.minutes > 0).length;
      const recentPoints = recent.reduce((sum, item) => sum + item.points, 0);
      const actualNextFour = [1, 2, 3, 4].reduce(
        (sum, offset) => sum + (player.byGw.get(gw + offset)?.points ?? 0),
        0
      ) / 4;
      const projectionFactor = [1, 2, 3, 4].reduce((sum, offset) => {
        const futureFixtures = player.byGw.get(gw + offset)?.fixtures ?? [];
        return sum + futureFixtures.reduce((fixtureSum, fixture) => {
          const difficulty = fixtureDifficulties.get(fixture.id);
          if (!difficulty) return fixtureSum;
          const fdr = fixture.isHome ? difficulty.home : difficulty.away;
          const fdrMultiplier = 1.25 - (fdr - 1) * 0.11;
          const homeMultiplier = fixture.isHome ? 1.05 : 0.97;
          return fixtureSum + fdrMultiplier * homeMultiplier;
        }, 0);
      }, 0) / 4;

      samples.push({
        pos: player.pos,
        ppg: totalPoints / appearances,
        form: recentAppearances > 0 ? recentPoints / recentAppearances : totalPoints / appearances,
        expectedGoals: totalExpectedGoals,
        expectedAssists: totalExpectedAssists,
        minutes: totalMinutes,
        actualNextFour,
        projectionFactor,
      });
    }
  }

  return samples;
}

// ---- Historical backtest (runs only when FULL_BACKTEST=1 and CSVs present) ----
describe('Historical backtest (skipped without data)', () => {
  const SEASONS = ['2022-23', '2023-24', '2024-25'];

  for (const season of SEASONS) {
    it(`[${season}] k=0 Spearman(projection, actual) ≥ 0.50`, () => {
      const csvPath = join(FIXTURES_DIR, `${season}/merged_gw.csv`);
      if (!RUN_FULL_BACKTEST || !existsSync(csvPath)) {
        console.log(`[SKIP] Set FULL_BACKTEST=1 and provide ${csvPath}.`);
        return;
      }

      const rows = parseCSV(readFileSync(csvPath, 'utf-8'));

      // Filter to rows with valid xP (ep_next equivalent)
      const validRows = rows.filter((r) => r['xP'] && parseFloat(r['xP']!) > 0 && r['total_points'] !== undefined);

      const xpVals = validRows.map((r) => parseFloat(r['xP']!));
      const actualVals = validRows.map((r) => parseFloat(r['total_points']!));

      const rho = spearman(xpVals, actualVals);
      console.log(`[${season}] k=0 Spearman: ${rho.toFixed(3)}`);

      expect(rho).toBeGreaterThanOrEqual(0.50);
    });
  }

  it('adopted xG/xA blend beats the multi-GW baseline and candidate sweep', () => {
    if (!RUN_FULL_BACKTEST) {
      console.log('[SKIP] Set FULL_BACKTEST=1 to compare multi-GW blends.');
      return;
    }

    const samplesBySeason = new Map<string, MultiGwBacktestSample[]>();
    for (const season of SEASONS) {
      const csvPath = join(FIXTURES_DIR, `${season}/merged_gw.csv`);
      const fixturesPath = join(FIXTURES_DIR, `${season}/fixtures.csv`);
      if (existsSync(csvPath) && existsSync(fixturesPath)) {
        samplesBySeason.set(
          season,
          buildMultiGwSamples(
            parseCSV(readFileSync(csvPath, 'utf-8')),
            parseCSV(readFileSync(fixturesPath, 'utf-8'))
          )
        );
      }
    }

    if (samplesBySeason.size === 0) {
      console.log(`[SKIP] No historical CSVs found under ${FIXTURES_DIR}.`);
      return;
    }

    const candidates: Record<string, Readonly<MultiGwBlend>> = {
      baseline: MULTI_GW_BASELINE_BLEND,
      '10% xG+xA': { ppg: 0.6, form: 0.3, expectedAttack: 0.1 },
      '20% xG+xA (adopted)': MULTI_GW_BLEND,
      '30% xG+xA': { ppg: 0.6, form: 0.1, expectedAttack: 0.3 },
      '40% xG+xA': { ppg: 0.6, form: 0, expectedAttack: 0.4 },
      '25% rebalance': { ppg: 0.5, form: 0.25, expectedAttack: 0.25 },
    };

    for (const [season, samples] of samplesBySeason) {
      const actual = samples.map((sample) => sample.actualNextFour);
      const baselineRho = spearman(
        samples.map(
          (sample) => multiGwBasePoints(sample, MULTI_GW_BASELINE_BLEND) * sample.projectionFactor
        ),
        actual
      );
      const adoptedRho = spearman(
        samples.map(
          (sample) => multiGwBasePoints(sample, MULTI_GW_BLEND) * sample.projectionFactor
        ),
        actual
      );
      console.log(
        `[${season}] GW+1..GW+4 Spearman baseline=${baselineRho.toFixed(4)} adopted=${adoptedRho.toFixed(4)}`
      );
      expect(adoptedRho).toBeGreaterThan(baselineRho);
    }

    const allSamples = [...samplesBySeason.values()].flat();
    const actual = allSamples.map((sample) => sample.actualNextFour);
    const scores = Object.entries(candidates).map(([name, blend]) => ({
      name,
      rho: spearman(
        allSamples.map(
          (sample) => multiGwBasePoints(sample, blend) * sample.projectionFactor
        ),
        actual
      ),
    })).sort((a, b) => b.rho - a.rho);

    console.log(
      `[pooled] ${scores.map(({ name, rho }) => `${name}=${rho.toFixed(4)}`).join(', ')}`
    );
    expect(scores[0]?.name).toBe('20% xG+xA (adopted)');
  });
});

// ---- ENGINE_CONFIG sanity ----
describe('ENGINE_CONFIG constants', () => {
  it('TRANSFER_HORIZON_GW is 5', () => {
    expect(ENGINE_CONFIG.TRANSFER_HORIZON_GW).toBe(5);
  });
  it('HIT_COST_PTS is 4', () => {
    expect(ENGINE_CONFIG.HIT_COST_PTS).toBe(4);
  });
  it('HIT_MIN_GAIN is 4.0', () => {
    expect(ENGINE_CONFIG.HIT_MIN_GAIN).toBe(4.0);
  });
  it('WILDCARD.MIN_GW is 9', () => {
    expect(ENGINE_CONFIG.WILDCARD.MIN_GW).toBe(9);
  });
  it('WILDCARD.MIN_SUSTAINED_DRIFT is 8.0', () => {
    expect(ENGINE_CONFIG.WILDCARD.MIN_SUSTAINED_DRIFT).toBe(8.0);
  });
  it('FREE_HIT.BLANK_OWNED_THRESHOLD is 3', () => {
    expect(ENGINE_CONFIG.FREE_HIT.BLANK_OWNED_THRESHOLD).toBe(3);
  });
});
