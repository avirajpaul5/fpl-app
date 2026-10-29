import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheInvalidatePattern } from '../cache.js';
import { getPlayers } from './players.js';

interface PlayersResponse {
  gw: number;
  players: Array<{
    expectedGoals: number;
    expectedAssists: number;
    minutes: number;
    upcoming: Array<{
      gw: number;
      oppTeam: number;
      isHome: boolean;
      fdr: number;
    }>;
    projByGw: number[];
    projHorizon: number;
  }>;
}

const bootstrap = {
  elements: [
    {
      id: 101,
      code: 5001,
      web_name: 'Fixture Player',
      element_type: 3,
      team: 1,
      now_cost: 75,
      cost_change_start: 5,
      ep_next: '5.4',
      ep_this: '0.0',
      form: '5.1',
      points_per_game: '4.8',
      expected_goals: '3.25',
      expected_assists: '2.10',
      minutes: 810,
      selected_by_percent: '12.3',
      status: 'a',
      news: '',
      chance_of_playing_next_round: null,
      total_points: 42,
    },
  ],
  teams: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    short_name: `T${index + 1}`,
    name: `Team ${index + 1}`,
  })),
  events: [
    ...Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `Gameweek ${i + 1}`,
      deadline_time: `2026-08-${String(20 + i).padStart(2, '0')}T10:00:00Z`,
      finished: true,
      is_current: i === 5,
      is_next: false,
    })),
    {
      id: 7,
      name: 'Gameweek 7',
      deadline_time: '2026-10-03T10:00:00Z',
      finished: false,
      is_current: false,
      is_next: true,
    },
  ],
};

const upcoming = [
  { id: 700, event: 7, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, finished: false },
  { id: 800, event: 8, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 2, finished: false },
  { id: 900, event: 9, team_h: 1, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 3, finished: false },
  { id: 1000, event: 10, team_h: 5, team_a: 1, team_h_difficulty: 2, team_a_difficulty: 4, finished: false },
  { id: 1100, event: 11, team_h: 1, team_a: 6, team_h_difficulty: 4, team_a_difficulty: 2, finished: false },
];
const played = Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i, event: i + 1, team_h: 1, team_a: (i % 5) + 2, team_h_difficulty: 3, team_a_difficulty: 3, finished: true,
}));

const live = {
  elements: [{
    id: 101,
    stats: {
      minutes: 90, starts: 1, total_points: 6, goals_scored: 0, assists: 1, saves: 0, bonus: 1,
      yellow_cards: 0, red_cards: 0, defensive_contribution: 4,
      expected_goals: '0.40', expected_assists: '0.30', expected_goals_conceded: '1.10',
    },
  }],
};

function installFplFetchMock(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | globalThis.Request) => {
    const url = String(input);
    if (url.endsWith('/bootstrap-static/')) {
      return new globalThis.Response(JSON.stringify(bootstrap), { status: 200 });
    }
    if (url.endsWith('/fixtures/')) {
      return new globalThis.Response(JSON.stringify([...played, ...upcoming]), { status: 200 });
    }
    if (/\/event\/\d+\/live\/$/.test(url)) {
      return new globalThis.Response(JSON.stringify(live), { status: 200 });
    }
    return new globalThis.Response('not found', { status: 404 });
  }));
}

async function callPlayersRoute(): Promise<PlayersResponse> {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { json, status } as unknown as Response;

  await getPlayers({ query: {} } as Request, response);

  expect(status).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledOnce();
  return json.mock.calls[0]![0] as PlayersResponse;
}

describe('GET /api/players', () => {
  beforeEach(() => {
    cacheInvalidatePattern('');
    installFplFetchMock();
  });

  afterEach(() => {
    cacheInvalidatePattern('');
    vi.unstubAllGlobals();
  });

  it('returns upcoming fixtures mapped from the player team', async () => {
    const body = await callPlayersRoute();

    expect(body.gw).toBe(7);
    expect(body.players[0]!.upcoming).toEqual([
      { gw: 7, oppTeam: 2, isHome: true, fdr: 2, isDGW: false },
      { gw: 8, oppTeam: 3, isHome: false, fdr: 2, isDGW: false },
      { gw: 9, oppTeam: 4, isHome: true, fdr: 3, isDGW: false },
      { gw: 10, oppTeam: 5, isHome: false, fdr: 4, isDGW: false },
      { gw: 11, oppTeam: 6, isHome: true, fdr: 4, isDGW: false },
    ]);
  });

  it('projects every upcoming gameweek from the season so far', async () => {
    const body = await callPlayersRoute();
    const player = body.players[0]!;

    expect(player.projByGw).toHaveLength(8);
    // GW7-11 have fixtures; later weeks are not scheduled in this mock.
    expect(player.projByGw.slice(0, 5).every((projection) => projection > 2)).toBe(true);
    expect(player.projByGw.slice(5).every((projection) => projection === 0)).toBe(true);
    expect(player.projHorizon).toBeCloseTo(player.projByGw.slice(0, 5).reduce((s, v) => s + v, 0), 5);
  });

  it('normalizes public expected-goals and expected-assists data', async () => {
    const player = (await callPlayersRoute()).players[0]!;

    expect(player.expectedGoals).toBe(3.25);
    expect(player.expectedAssists).toBe(2.1);
    expect(player.minutes).toBe(810);
  });
});
