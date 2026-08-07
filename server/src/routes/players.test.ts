import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheInvalidatePattern } from '../cache.js';
import { getPlayers } from './players.js';

interface PlayersResponse {
  gw: number;
  players: Array<{
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
      web_name: 'Fixture Player',
      element_type: 3,
      team: 1,
      now_cost: 75,
      ep_next: '5.4',
      ep_this: '0.0',
      form: '5.1',
      points_per_game: '4.8',
      selected_by_percent: '12.3',
      status: 'a',
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

const fixtures = new Map([
  [7, { id: 700, event: 7, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, finished: false }],
  [8, { id: 800, event: 8, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 2, finished: false }],
  [9, { id: 900, event: 9, team_h: 1, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 3, finished: false }],
  [10, { id: 1000, event: 10, team_h: 5, team_a: 1, team_h_difficulty: 2, team_a_difficulty: 4, finished: false }],
  [11, { id: 1100, event: 11, team_h: 1, team_a: 6, team_h_difficulty: 4, team_a_difficulty: 2, finished: false }],
]);

function installFplFetchMock(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | globalThis.Request) => {
    const url = String(input);
    if (url.endsWith('/bootstrap-static/')) {
      return new globalThis.Response(JSON.stringify(bootstrap), { status: 200 });
    }

    const gameweek = Number(new URL(url).searchParams.get('event'));
    const fixture = fixtures.get(gameweek);
    return new globalThis.Response(JSON.stringify(fixture ? [fixture] : []), { status: 200 });
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

  it('returns a populated five-gameweek projection', async () => {
    const body = await callPlayersRoute();
    const player = body.players[0]!;

    expect(player.projByGw).toHaveLength(5);
    expect(player.projByGw.every((projection) => projection > 0)).toBe(true);
    expect(player.projHorizon).toBeGreaterThan(0);
  });
});
