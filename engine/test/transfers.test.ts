import { describe, expect, it } from 'vitest';
import { adviseWeek, freeTransfersAfter, inferFreeTransfers, planTransfers } from '../src/index.js';
import { earlySeasonTrust } from '../src/transfers.js';
import { legalSquad, projected, squadWithCaptain } from './helpers.js';

const squad = squadWithCaptain(3);

describe('planTransfers', () => {
  it('rolls when no replacement is meaningfully better', () => {
    const pool = [...squad, ...legalSquad(3.05, 5, 100).map((p) => ({ ...p, team: p.team + 20 }))];
    // (the near-identical alternatives gain far less than a saved transfer is worth)
    const plan = planTransfers({ players: squad }, pool, 1, { bank: 0 });
    expect(plan.recommendation).toBe('bank');
    expect(plan.moves).toHaveLength(0);
    expect(plan.freeTransfersNext).toBe(2);
    expect(plan.reason).toMatch(/Roll/);
  });

  it('makes a clearly better move with a free transfer', () => {
    const star = projected(200, 'MID', 5, 7, { team: 30 });
    const plan = planTransfers({ players: squad }, [...squad, star], 1, { bank: 0 });
    expect(plan.recommendation).toBe('transfer');
    expect(plan.moves[0]!.in.id).toBe(200);
    expect(plan.moves[0]!.out.pos).toBe('MID');
  });

  it('respects the bank and selling prices', () => {
    const star = projected(200, 'MID', 6, 7, { team: 30 });
    const sell = Object.fromEntries(squad.map((p) => [p.id, 5]));
    expect(planTransfers({ players: squad }, [...squad, star], 1, { bank: 0.5, sellingPrices: sell }).moves).toHaveLength(0);
    expect(planTransfers({ players: squad }, [...squad, star], 1, { bank: 1, sellingPrices: sell }).moves).toHaveLength(1);
  });

  it('does not take a hit for a marginal gain', () => {
    const better = projected(200, 'FWD', 5, 4, { team: 30 }); // +1/GW over a 3-point starter
    const plan = planTransfers({ players: squad }, [...squad, better], 0, { bank: 0 });
    expect(plan.hitsTaken).toBe(0);
  });

  it('takes a hit only for a large gain, and never when hits are disabled', () => {
    const superstar = projected(200, 'FWD', 5, 10, { team: 30 });
    const pool = [...squad, superstar];
    expect(planTransfers({ players: squad }, pool, 0, { bank: 0 }).hitsTaken).toBe(1);
    expect(planTransfers({ players: squad }, pool, 0, { bank: 0, allowHits: false }).moves).toHaveLength(0);
  });

  it('uses a free transfer that would otherwise be wasted at the cap', () => {
    const slightlyBetter = projected(200, 'MID', 5, 3.6, { team: 30 });
    const pool = [...squad, slightlyBetter];
    expect(planTransfers({ players: squad }, pool, 1, { bank: 0 }).moves).toHaveLength(0);
    expect(planTransfers({ players: squad }, pool, 5, { bank: 0 }).moves).toHaveLength(1);
  });

  it('pairs a sale with an upgrade the bank alone cannot fund', () => {
    const pricey = projected(200, 'FWD', 9, 8, { team: 30 });
    const cheapDef = projected(201, 'DEF', 1, 3, { team: 31 });
    const plan = planTransfers({ players: squad }, [...squad, pricey, cheapDef], 2, { bank: 0 });
    expect(plan.moves.map((m) => m.in.id).sort()).toEqual([200, 201]);
  });

  it('trusts projected gains less early in the season', () => {
    expect(earlySeasonTrust(2)).toBeLessThan(earlySeasonTrust(6));
    expect(earlySeasonTrust(9)).toBe(1);
  });
});

describe('free transfers', () => {
  it('rolls up to a cap of five', () => {
    expect(freeTransfersAfter(1, 0)).toBe(2);
    expect(freeTransfersAfter(5, 0)).toBe(5);
    expect(freeTransfersAfter(2, 3)).toBe(1);
  });

  it('infers the count from history, keeping transfers through a Free Hit', () => {
    const weeks = [
      { gw: 1, transfers: 0, chip: null },
      { gw: 2, transfers: 1, chip: 'bboost' },
      { gw: 3, transfers: 0, chip: 'freehit' },
      { gw: 4, transfers: 0, chip: null },
      { gw: 5, transfers: 0, chip: null },
      { gw: 6, transfers: 2, chip: null },
      { gw: 7, transfers: 0, chip: null },
      { gw: 8, transfers: 0, chip: null },
    ];
    expect(inferFreeTransfers(weeks, 4)).toBe(1);
    expect(inferFreeTransfers(weeks, 6)).toBe(3);
    expect(inferFreeTransfers(weeks, 9)).toBe(4);
  });
});

describe('adviseWeek', () => {
  it('returns the lineup for the squad after the recommended transfers', () => {
    const star = projected(200, 'FWD', 5, 9, { team: 30 });
    const week = adviseWeek([...squad, star], {
      gw: 10, squad: squad.map((p) => p.id), bank: 0, freeTransfers: 1, sellingPrices: {},
    });
    expect(week.advice.transfers[0]!.in).toBe(200);
    expect(week.advice.captain).toBe(200);
    expect(week.xi.starters.map((p) => p.id)).toContain(200);
  });
});
