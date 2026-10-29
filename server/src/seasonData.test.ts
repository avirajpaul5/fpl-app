import { describe, expect, it } from 'vitest';
import type { RawBootstrap, RawElement, RawEntry, RawTransfer } from './fplClient.js';
import { priceAt, scoringRules, startPrice, type SeasonData } from './seasonData.js';
import { reconstructPurchasePrices } from './managerState.js';

const element = (id: number, now: number, change: number): RawElement => ({
  id, web_name: `P${id}`, element_type: 3, team: 1, now_cost: now, cost_change_start: change,
  ep_next: null, ep_this: null, form: '0', points_per_game: '0', expected_goals: '0',
  expected_assists: '0', minutes: 0, selected_by_percent: '0', status: 'a', chance_of_playing_next_round: null,
  total_points: 0,
});

describe('prices', () => {
  it('derives the season-start price and interpolates past deadlines', () => {
    const el = element(1, 80, 4); // £8.0m now, started at £7.6m
    expect(startPrice(el)).toBe(7.6);
    expect(priceAt(el, 1, 9)).toBe(7.6);
    expect(priceAt(el, 5, 9)).toBe(7.8);
    expect(priceAt(el, 9, 9)).toBe(8);
  });
});

describe('scoringRules', () => {
  it('reads per-position scoring from the bootstrap', () => {
    const rules = scoringRules({
      game_config: { scoring: { goals_scored: { GKP: 10, DEF: 6, MID: 5, FWD: 4 }, assists: 3, defensive_contribution: { GKP: 0, DEF: 2, MID: 2, FWD: 2 } } },
    } as unknown as RawBootstrap);
    expect(rules.goal.GK).toBe(10);
    expect(rules.defcon.MID).toBe(2);
  });
});

describe('reconstructPurchasePrices', () => {
  it('replays transfers but ignores Free Hit weeks', () => {
    const data = { elements: new Map([[1, element(1, 50, 0)], [2, element(2, 60, 0)], [3, element(3, 70, 0)]]), nextGw: 9 } as unknown as SeasonData;
    const transfers: RawTransfer[] = [
      { element_out: 1, element_in: 2, element_in_cost: 62, element_out_cost: 50, event: 3, time: '2026-09-01T00:00:00Z' },
      { element_out: 1, element_in: 3, element_in_cost: 71, element_out_cost: 50, event: 4, time: '2026-09-10T00:00:00Z' },
    ];
    const prices = reconstructPurchasePrices(data, { started_event: 1 } as RawEntry, transfers, { 3: 'freehit' }, [1], 9);
    // The GW3 Free Hit signing reverted; player 1 stayed until the GW4 sale.
    expect(prices[2]).toBeUndefined();
    expect(prices[1]).toBeUndefined();
    expect(prices[3]).toBe(7.1);
  });
});
