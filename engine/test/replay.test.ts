import { describe, expect, it } from 'vitest';
import { followAdvisor, scoreSelection, sellingPrice, type Pos, type ReplayData } from '../src/index.js';

const POS: Record<number, Pos> = {
  1: 'GK', 2: 'DEF', 3: 'DEF', 4: 'DEF', 5: 'MID', 6: 'MID', 7: 'MID', 8: 'MID', 9: 'FWD', 10: 'FWD', 11: 'FWD',
  12: 'GK', 13: 'DEF', 14: 'MID', 15: 'DEF',
};

function data(points: Record<number, { pts: number; mins: number }>): ReplayData {
  return {
    pos: (id) => POS[id] ?? 'MID',
    actual: (id) => points[id] ?? { pts: 2, mins: 90 },
    price: () => 5,
  };
}

const sel = { starters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], bench: [13, 14, 15, 12], captain: 9, vice: 5 };

describe('scoreSelection', () => {
  it('scores the XI with a doubled captain', () => {
    expect(scoreSelection(data({ 9: { pts: 10, mins: 90 } }), 1, sel)).toBe(10 * 2 + 10 * 2);
  });

  it('auto-subs a non-playing starter and passes the armband to the vice', () => {
    const d = data({ 9: { pts: 0, mins: 0 }, 13: { pts: 6, mins: 90 }, 5: { pts: 8, mins: 90 } });
    // FWD 9 out; DEF 13 is first on the bench and keeps a legal formation (4-4-2).
    // Nine 2-point starters + the 6-point sub + vice 8, doubled.
    expect(scoreSelection(d, 1, sel)).toBe(9 * 2 + 6 + 8 + 8);
  });

  it('skips a sub that would break the formation', () => {
    const fwdsOut = data({ 9: { pts: 0, mins: 0 }, 10: { pts: 0, mins: 0 }, 11: { pts: 0, mins: 0 } });
    const fwdBench = { ...sel, bench: [13, 14, 15, 12] };
    // No forward on the bench: the first two outfield subs come on, the last forward slot stays empty (min 1 FWD).
    expect(scoreSelection(fwdsOut, 1, fwdBench)).toBe(8 * 2 + 2 * 2 + 2);
  });

  it('counts every player under Bench Boost', () => {
    expect(scoreSelection(data({}), 1, sel, 'bboost')).toBe(15 * 2 + 2);
  });
});

describe('sellingPrice', () => {
  it('keeps half the profit, rounded down, and all of a loss', () => {
    expect(sellingPrice(5.0, 5.3)).toBe(5.1);
    expect(sellingPrice(5.0, 5.4)).toBe(5.2);
    expect(sellingPrice(6.0, 5.7)).toBe(5.7);
  });
});

describe('followAdvisor', () => {
  it('charges hits and keeps free transfers through a Free Hit week', () => {
    const squad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const seen: number[] = [];
    const result = followAdvisor(data({}), (s) => {
      seen.push(s.freeTransfers);
      return { ...sel, transfers: s.gw === 2 ? [{ out: 15, in: 16 }, { out: 14, in: 17 }] : [] };
    }, { squad, purchasePrices: {}, bank: 1, freeTransfers: 1 }, 2, 4, { 3: 'freehit' }, { 3: 50 });
    expect(result.weeks[0]!.hits).toBe(1);
    expect(result.weeks[1]!.points).toBe(50);
    expect(seen).toEqual([1, 1]); // GW2: 1 FT; after a hit and a Free Hit week, GW4 starts with 1
  });
});
