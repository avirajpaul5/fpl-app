import { describe, expect, it } from 'vitest';
import { inferChipAvailability } from './chipAvailability.js';

describe('inferChipAvailability', () => {
  it('starts the first half with both uses remaining', () => {
    expect(inferChipAvailability([], 1)).toEqual({
      wildcard: 2,
      freeHit: 2,
      benchBoost: 2,
      tripleCaptain: 2,
    });
  });

  it('subtracts first-half uses while preserving the refreshed use', () => {
    expect(inferChipAvailability([
      { name: 'wildcard', event: 8 },
      { name: 'freehit', event: 12 },
      { name: 'bboost', event: 15 },
      { name: '3xc', event: 19 },
    ], 19)).toEqual({
      wildcard: 1,
      freeHit: 1,
      benchBoost: 1,
      tripleCaptain: 1,
    });
  });

  it('expires unused first-half chips when the second window opens', () => {
    expect(inferChipAvailability([], 20)).toEqual({
      wildcard: 1,
      freeHit: 1,
      benchBoost: 1,
      tripleCaptain: 1,
    });
  });

  it('only subtracts uses from the active second-half window', () => {
    expect(inferChipAvailability([
      { name: 'wildcard', event: 8 },
      { name: 'wildcard', event: 24 },
      { name: 'freehit', event: 19 },
      { name: 'bboost', event: 30 },
    ], 31)).toEqual({
      wildcard: 0,
      freeHit: 1,
      benchBoost: 0,
      tripleCaptain: 1,
    });
  });

  it('never reports a negative remaining-use count', () => {
    expect(inferChipAvailability([
      { name: '3xc', event: 21 },
      { name: '3xc', event: 22 },
    ], 23).tripleCaptain).toBe(0);
  });
});
