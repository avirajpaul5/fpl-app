import { describe, expect, it } from 'vitest';
import { availability, projectAll, type ModelFixture, type ModelPlayer } from '../src/index.js';
import { modelPlayer, stat } from './helpers.js';

// Two teams playing each other every week, GW1-10.
const fixtures: ModelFixture[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  gw: i + 1,
  home: i % 2 === 0 ? 1 : 2,
  away: i % 2 === 0 ? 2 : 1,
}));

const weeks = (n: number, overrides = {}) => Array.from({ length: n }, (_, i) => stat(i + 1, overrides));

// League-average output for both clubs, so team strengths are realistic.
const league = [
  modelPlayer(901, 'MID', 1, weeks(5, { xg: 1.35, xa: 0, xgc: 1.35, starts: 1 })),
  modelPlayer(902, 'MID', 2, weeks(5, { xg: 1.35, xa: 0, xgc: 1.35, starts: 1 })),
];

function run(players: ModelPlayer[], nextGw = 6, extraFixtures: ModelFixture[] = []) {
  return projectAll({ players: [...league, ...players], fixtures: [...fixtures, ...extraFixtures], nextGw, horizon: 5 });
}

describe('projectAll', () => {
  it('ranks a nailed-on scorer above a benched player of the same price', () => {
    const striker = modelPlayer(1, 'FWD', 1, weeks(5, { xg: 0.7, xa: 0.1, bonus: 1 }));
    const benched = modelPlayer(2, 'FWD', 1, weeks(5, { minutes: 0, starts: 0, xg: 0 }));
    const proj = run([striker, benched]);
    expect(proj.get(1)!.byGw[0]).toBeGreaterThan(4);
    expect(proj.get(2)!.byGw[0]).toBeLessThan(1.5);
    expect(proj.get(1)!.pStart).toBeGreaterThan(0.8);
    expect(proj.get(2)!.pStart).toBeLessThan(0.2);
  });

  it('reacts quickly when a regular starter is dropped', () => {
    const history = weeks(5);
    history[4] = stat(5, { minutes: 0, starts: 0 });
    const dropped = run([modelPlayer(1, 'MID', 1, history)]).get(1)!;
    const regular = run([modelPlayer(1, 'MID', 1, weeks(5))]).get(1)!;
    expect(dropped.pStart).toBeLessThan(regular.pStart - 0.3);
  });

  it('sums a double gameweek and zeroes a blank', () => {
    const extra: ModelFixture[] = [{ id: 99, gw: 7, home: 1, away: 2 }];
    const blankless = fixtures.filter((f) => f.gw !== 8);
    const proj = projectAll({
      players: [...league, modelPlayer(1, 'MID', 1, weeks(5, { xg: 0.3, xa: 0.2 }))],
      fixtures: [...blankless, ...extra],
      nextGw: 6,
      horizon: 4,
    }).get(1)!;
    expect(proj.byGw[1]).toBeGreaterThan(proj.byGw[0]! * 1.6); // GW7 double
    expect(proj.byGw[2]).toBe(0); // GW8 blank
  });

  it('gives defenders more clean-sheet value against a weak attack', () => {
    const def = modelPlayer(1, 'DEF', 1, weeks(5, { xgc: 0.6 }));
    const strong = projectAll({ players: [def, modelPlayer(2, 'FWD', 2, weeks(5, { xg: 2.5 }))], fixtures, nextGw: 6, horizon: 1 }).get(1)!;
    const weak = projectAll({ players: [def, modelPlayer(2, 'FWD', 2, weeks(5, { xg: 0.4 }))], fixtures, nextGw: 6, horizon: 1 }).get(1)!;
    expect(weak.next.cleanSheet).toBeGreaterThan(strong.next.cleanSheet);
    expect(weak.next.cleanSheet).toBeGreaterThan(1);
  });

  it('uses last season as a prior early in the season', () => {
    const thin = [stat(1, { xg: 0 })];
    const without = run([modelPlayer(1, 'FWD', 1, thin)], 2).get(1)!;
    const withPrior = run([modelPlayer(1, 'FWD', 1, thin, {
      prior: { minutes: 3000, starts: 34, fixtures: 38, xg: 25, xa: 5, goals: 24, assists: 5, bonus: 30, saves: 0, yellow: 3, defconGames: 0, defconHits: 0 },
    })], 2).get(1)!;
    expect(withPrior.next.goals).toBeGreaterThan(without.next.goals * 1.5);
  });

  it('zeroes injured players next week', () => {
    const p = modelPlayer(1, 'MID', 1, weeks(5), { status: 'i', chanceNext: 0 });
    expect(run([p]).get(1)!.byGw[0]).toBe(0);
  });
});

describe('availability', () => {
  const deadlines = { 6: '2026-10-31T11:00:00Z', 7: '2026-11-07T11:00:00Z', 8: '2026-11-21T11:00:00Z' };

  it('maps "Expected back" news to the right gameweek', () => {
    const p = modelPlayer(1, 'MID', 1, [], { status: 'i', chanceNext: 0, news: 'Hamstring injury - Expected back 10 Nov' });
    expect(availability(p, 0, 6, deadlines)).toBe(0);
    expect(availability(p, 1, 7, deadlines)).toBe(0);
    expect(availability(p, 2, 8, deadlines)).toBe(1);
  });

  it('uses the published chance for doubtful players', () => {
    const p = modelPlayer(1, 'MID', 1, [], { status: 'd', chanceNext: 75 });
    expect(availability(p, 0, 6)).toBe(0.75);
    expect(availability(p, 1, 7)).toBe(1);
  });

  it('treats a one-match ineligibility as temporary', () => {
    const p = modelPlayer(1, 'MID', 1, [], { status: 'n', chanceNext: 0 });
    expect(availability(p, 0, 6)).toBe(0);
    expect(availability(p, 1, 7)).toBe(1);
  });

  it('treats players who left the club as unavailable', () => {
    const p = modelPlayer(1, 'MID', 1, [], { status: 'u', chanceNext: 0 });
    expect(availability(p, 3, 9)).toBe(0);
  });
});
