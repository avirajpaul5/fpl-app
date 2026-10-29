import type { GwStat, ModelPlayer, Pos, ProjectedPlayer } from '../src/index.js';

const QUOTA: Pos[] = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];

export function projected(
  id: number,
  pos: Pos,
  price: number,
  perGw: number | number[],
  overrides: Partial<ProjectedPlayer> = {}
): ProjectedPlayer {
  const projByGw = Array.isArray(perGw) ? perGw : Array.from({ length: 5 }, () => perGw);
  return {
    id,
    name: `P${id}`,
    pos,
    team: id,
    teamName: `T${id}`,
    price,
    epNext: 0,
    ppg: 0,
    form: 0,
    expectedGoals: 0,
    expectedAssists: 0,
    minutes: 0,
    ownership: 10,
    status: 'a',
    chanceNext: null,
    totalPoints: 0,
    upcoming: [],
    projByGw,
    projHorizon: projByGw.slice(0, 5).reduce((s, v) => s + v, 0),
    pStart: 0.9,
    ...overrides,
  };
}

/** A legal 15-man squad (distinct clubs) where every player projects `perGw`. */
export function legalSquad(perGw = 3, price = 5, idOffset = 0): ProjectedPlayer[] {
  return QUOTA.map((pos, i) => projected(idOffset + i + 1, pos, price, perGw, { team: (i % 15) + 1 }));
}

/** Like legalSquad, but with a clear captain (the last forward projects 8). */
export function squadWithCaptain(perGw = 3): ProjectedPlayer[] {
  const squad = legalSquad(perGw);
  squad[14] = { ...squad[14]!, projByGw: [8, 8, 8, 8, 8], projHorizon: 40 };
  return squad;
}

export function stat(gw: number, overrides: Partial<GwStat> = {}): GwStat {
  return {
    gw, minutes: 90, starts: 1, points: 2, xg: 0, xa: 0, xgc: 1.3, goals: 0, assists: 0,
    saves: 0, bonus: 0, defcon: 0, yellow: 0, red: 0, ...overrides,
  };
}

export function modelPlayer(id: number, pos: Pos, team: number, history: GwStat[], overrides: Partial<ModelPlayer> = {}): ModelPlayer {
  return { id, pos, team, price: 7, history, ...overrides };
}
