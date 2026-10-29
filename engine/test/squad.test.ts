import { describe, expect, it } from 'vitest';
import { bestXI, evaluateChips, optimizeSquad, pickCaptain, squadValue, validateSquad } from '../src/index.js';
import { legalSquad, projected } from './helpers.js';

describe('validateSquad', () => {
  it('accepts a legal squad', () => {
    expect(validateSquad({ players: legalSquad() }).ok).toBe(true);
  });

  it('rejects wrong size, club cap and budget violations', () => {
    expect(validateSquad({ players: legalSquad().slice(0, 14) }).ok).toBe(false);
    const fourFromOneClub = legalSquad().map((p, i) => (i < 4 ? { ...p, team: 1 } : p));
    expect(validateSquad({ players: fourFromOneClub }).errors.some((e) => e.includes('max 3'))).toBe(true);
    expect(validateSquad({ players: legalSquad(3, 7) }).ok).toBe(false);
  });
});

describe('bestXI', () => {
  it('picks a legal XI with the reserve goalkeeper last on the bench', () => {
    const squad = legalSquad().map((p, i) => ({ ...p, projByGw: [i * 0.3] }));
    const xi = bestXI({ players: squad });
    expect(xi.starters).toHaveLength(11);
    expect(xi.starters.filter((p) => p.pos === 'GK')).toHaveLength(1);
    expect(xi.starters.filter((p) => p.pos === 'DEF').length).toBeGreaterThanOrEqual(3);
    expect(xi.starters.filter((p) => p.pos === 'FWD').length).toBeGreaterThanOrEqual(1);
    expect(xi.bench).toHaveLength(4);
    expect(xi.bench[3]!.pos).toBe('GK');
  });

  it('benches players who are projected to score less', () => {
    const squad = legalSquad(3);
    squad[2] = { ...squad[2]!, projByGw: [0] }; // a DEF who won't play
    const xi = bestXI({ players: squad });
    expect(xi.starters.map((p) => p.id)).not.toContain(squad[2]!.id);
  });

  it('captains the highest projection and prefers attackers on ties', () => {
    const tied = [projected(1, 'GK', 5, 4), projected(2, 'DEF', 5, 4), projected(3, 'MID', 5, 4), projected(4, 'FWD', 5, 4)];
    const pick = pickCaptain(tied);
    expect(pick.captain.pos).toBe('FWD');
    expect(pick.viceCaptain.pos).toBe('MID');
  });
});

describe('squadValue', () => {
  it('counts the XI and doubles the captain, not the bench', () => {
    const squad = legalSquad(2);
    // 11 starters × 2 + captain 2 + 0.1 × 3 outfield bench × 2, for one GW
    expect(squadValue(squad, { horizon: 1, benchWeight: 0.1 })).toBeCloseTo(22 + 2 + 0.6, 5);
  });
});

describe('optimizeSquad', () => {
  it('builds a legal squad within budget that favours high projections', () => {
    const pool = [
      ...legalSquad(2, 4.5, 0),
      ...legalSquad(5, 6.5, 100).map((p) => ({ ...p, team: p.team + 20 })),
      projected(500, 'FWD', 12, 9, { team: 40 }),
    ];
    const squad = optimizeSquad(pool, { budget: 100 });
    expect(validateSquad(squad).ok).toBe(true);
    expect(squad.players.map((p) => p.id)).toContain(500);
  });
});

describe('evaluateChips', () => {
  it('marks spent chips unavailable and holds weak chip weeks', () => {
    const squad = { players: legalSquad(2.5) };
    const advice = evaluateChips(squad, 9, { gw: 9, allPlayers: squad.players, windowEnd: 19 }, {
      wildcard: 1, freeHit: 0, benchBoost: 1, tripleCaptain: 1,
    });
    expect(advice.freeHit.recommend).toBe(false);
    expect(advice.freeHit.reason).toContain('Not available');
    expect(advice.benchBoost.recommend).toBe(false); // a 10-point bench is below the bar
    expect(advice.tripleCaptain.recommend).toBe(false);
  });

  it('recommends Bench Boost in a strong double-gameweek week', () => {
    const players = legalSquad(3).map((p) => ({ ...p, projByGw: [7, 3, 3] }));
    const advice = evaluateChips({ players }, 9, { gw: 9, allPlayers: players, windowEnd: 19 });
    expect(advice.benchBoost.recommend).toBe(true);
    expect(advice.benchBoost.gw).toBe(9);
  });
});
