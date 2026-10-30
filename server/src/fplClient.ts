import { Player, Pos, UpcomingFixture } from '@fpl/engine';
import { cacheGet, cacheSet } from './cache.js';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

const TTL = {
  bootstrap: 15 * 60 * 1000,   // 15 min
  fixtures: 30 * 60 * 1000,    // 30 min
  liveFinished: 24 * 60 * 60 * 1000, // finished GWs never change
  liveCurrent: 5 * 60 * 1000,  // 5 min
  entry: 5 * 60 * 1000,        // 5 min
};

async function fplFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'fpl-app/1.0',
    },
  });
  if (!res.ok) throw new Error(`FPL API ${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit) return hit;
  const data = await load();
  cacheSet(key, data, ttl);
  return data;
}

// ---- Raw FPL types ----
export interface RawElement {
  id: number;
  code?: number;
  web_name: string;
  element_type: number; // 1=GK,2=DEF,3=MID,4=FWD,5=MNG
  team: number;
  now_cost: number;
  cost_change_start?: number;
  ep_next: string | null;
  ep_this: string | null;
  form: string;
  points_per_game: string;
  expected_goals: string;
  expected_assists: string;
  minutes: number;
  selected_by_percent: string;
  status: string;
  news?: string;
  chance_of_playing_next_round: number | null;
  total_points: number;
}

interface RawTeam {
  id: number;
  short_name: string;
  name: string;
}

export interface RawEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface RawBootstrap {
  elements: RawElement[];
  teams: RawTeam[];
  events: RawEvent[];
  game_config?: { scoring?: Record<string, number | Record<string, number>> };
}

export interface RawFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  finished: boolean;
  kickoff_time?: string | null;
}

export interface RawLiveElement {
  id: number;
  stats: {
    minutes: number;
    starts: number;
    total_points: number;
    goals_scored: number;
    assists: number;
    saves: number;
    bonus: number;
    yellow_cards: number;
    red_cards: number;
    defensive_contribution?: number;
    expected_goals: string;
    expected_assists: string;
    expected_goals_conceded: string;
  };
}

export interface RawLive {
  elements: RawLiveElement[];
}

export interface RawPick {
  element: number;
  position: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
  purchase_price?: number;
  selling_price?: number;
}

export interface RawEntryHistoryRow {
  event: number;
  points: number;
  total_points: number;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench?: number;
}

interface RawChipUse {
  name: string;
  event: number;
}

export interface RawEntryHistory {
  current: RawEntryHistoryRow[];
  chips: RawChipUse[];
}

export interface RawEntryEvent {
  picks: RawPick[];
  active_chip: string | null;
  entry_history?: RawEntryHistoryRow;
}

export interface RawEntry {
  id: number;
  name?: string;
  player_first_name: string;
  player_last_name: string;
  summary_overall_rank: number;
  summary_overall_points: number;
  current_event: number;
  started_event?: number;
}

export interface RawTransfer {
  element_in: number;
  element_in_cost: number;
  element_out: number;
  element_out_cost: number;
  event: number;
  time: string;
}

// ---- Normalization helpers ----

export function normalizePos(elementType: number): Pos | null {
  switch (elementType) {
    case 1: return 'GK';
    case 2: return 'DEF';
    case 3: return 'MID';
    case 4: return 'FWD';
    default: return null; // 5 = MNG, exclude
  }
}

// Also handles string-form position labels from CSV sources
export function normalizePosLabel(label: string): Pos {
  const u = label.toUpperCase().trim();
  if (u === 'GKP' || u === 'GK') return 'GK';
  if (u === 'DEF') return 'DEF';
  if (u === 'MID' || u === 'AM') return 'MID'; // 'AM' = attacking mid, fold into MID
  if (u === 'FWD') return 'FWD';
  throw new Error(`Unknown position label: ${label}`);
}

// ---- Exported fetch functions ----

/** The first gameweek whose deadline is still in the future (FPL's own flags can lag). */
export function upcomingEvent(bootstrap: RawBootstrap, now = Date.now()): RawEvent | undefined {
  return bootstrap.events
    .filter((e) => Date.parse(e.deadline_time) > now)
    .sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0];
}

export async function fetchBootstrap(): Promise<RawBootstrap> {
  const hit = cacheGet<RawBootstrap>('bootstrap');
  if (hit) return hit;
  const data = await fplFetch<RawBootstrap>(`${FPL_BASE}/bootstrap-static/`);
  // Never serve a cached copy past the next deadline: the GW being planned changes then.
  const next = upcomingEvent(data);
  const untilDeadline = next ? Date.parse(next.deadline_time) - Date.now() : TTL.bootstrap;
  cacheSet('bootstrap', data, Math.max(5_000, Math.min(TTL.bootstrap, untilDeadline)));
  return data;
}

/** Every fixture of the season in one request. */
export function fetchAllFixtures(): Promise<RawFixture[]> {
  return cached('fixtures:all', TTL.fixtures, () => fplFetch<RawFixture[]>(`${FPL_BASE}/fixtures/`));
}

/** Per-player stats for one gameweek (one request covers every player). */
export function fetchEventLive(gw: number, finished: boolean): Promise<RawLive> {
  return cached(`live:${gw}`, finished ? TTL.liveFinished : TTL.liveCurrent,
    () => fplFetch<RawLive>(`${FPL_BASE}/event/${gw}/live/`));
}

export function fetchEntry(teamId: number): Promise<RawEntry> {
  return cached(`entry:${teamId}`, TTL.entry, () => fplFetch<RawEntry>(`${FPL_BASE}/entry/${teamId}/`));
}

export function fetchEntryEvent(teamId: number, gw: number): Promise<RawEntryEvent> {
  return cached(`entry:${teamId}:event:${gw}`, TTL.entry,
    () => fplFetch<RawEntryEvent>(`${FPL_BASE}/entry/${teamId}/event/${gw}/picks/`));
}

export function fetchEntryHistory(teamId: number): Promise<RawEntryHistory> {
  return cached(`entry:${teamId}:history`, TTL.entry,
    () => fplFetch<RawEntryHistory>(`${FPL_BASE}/entry/${teamId}/history/`));
}

export function fetchEntryTransfers(teamId: number): Promise<RawTransfer[]> {
  return cached(`entry:${teamId}:transfers`, TTL.entry,
    () => fplFetch<RawTransfer[]>(`${FPL_BASE}/entry/${teamId}/transfers/`));
}

// ---- Main player normalization ----

export async function fetchNormalizedPlayers(currentGw: number): Promise<Player[]> {
  const key = `normalized-players:${currentGw}`;
  const hit = cacheGet<Player[]>(key);
  if (hit) return hit;

  const [bootstrap, allFixtures] = await Promise.all([fetchBootstrap(), fetchAllFixtures()]);
  const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const fixturesByTeam = new Map(
    bootstrap.teams.map((team) => [team.id, buildTeamUpcoming(team.id, currentGw, allFixtures)])
  );

  const players: Player[] = [];
  for (const el of bootstrap.elements) {
    const pos = normalizePos(el.element_type);
    if (!pos) continue; // skip managers

    const team = teamMap.get(el.team);
    players.push({
      id: el.id,
      name: el.web_name,
      pos,
      team: el.team,
      teamName: team?.short_name ?? String(el.team),
      price: el.now_cost / 10, // normalize ×10 → £m
      epNext: parseFloat(el.ep_next ?? '0') || 0,
      ppg: parseFloat(el.points_per_game) || 0,
      form: parseFloat(el.form) || 0,
      expectedGoals: parseFloat(el.expected_goals) || 0,
      expectedAssists: parseFloat(el.expected_assists) || 0,
      minutes: el.minutes || 0,
      ownership: parseFloat(el.selected_by_percent) || 0,
      status: el.status,
      chanceNext: el.chance_of_playing_next_round,
      news: el.news || undefined,
      totalPoints: el.total_points,
      upcoming: fixturesByTeam.get(el.team) ?? [],
    });
  }

  cacheSet(key, players, TTL.bootstrap);
  return players;
}

export function buildTeamUpcoming(
  teamId: number,
  currentGw: number,
  fixtures: RawFixture[],
  maxGws = 10
): UpcomingFixture[] {
  const teamGwFixtures = new Map<number, RawFixture[]>();
  for (const f of fixtures) {
    if (f.event == null || f.event < currentGw || f.event >= currentGw + maxGws) continue;
    if (f.team_h === teamId || f.team_a === teamId) {
      const existing = teamGwFixtures.get(f.event) ?? [];
      existing.push(f);
      teamGwFixtures.set(f.event, existing);
    }
  }

  const upcoming: UpcomingFixture[] = [];
  for (const gw of [...teamGwFixtures.keys()].sort((a, b) => a - b)) {
    const gwFs = teamGwFixtures.get(gw)!;
    const isDGW = gwFs.length >= 2;
    for (const f of gwFs) {
      const isHome = f.team_h === teamId;
      upcoming.push({
        gw,
        oppTeam: isHome ? f.team_a : f.team_h,
        isHome,
        fdr: isHome ? f.team_h_difficulty : f.team_a_difficulty,
        isDGW,
      });
    }
  }
  return upcoming;
}

/** The next gameweek whose deadline has not passed. */
export async function getCurrentGw(): Promise<number> {
  const bootstrap = await fetchBootstrap();
  const upcoming = upcomingEvent(bootstrap);
  if (upcoming) return upcoming.id;
  // Season over: stay on the final gameweek.
  return Math.max(1, ...bootstrap.events.map((e) => e.id));
}

export async function fetchUserTeam(teamId: number, gw: number) {
  const [entry, entryEvent] = await Promise.all([
    fetchEntry(teamId),
    fetchEntryEvent(teamId, gw),
  ]);
  return { entry, picks: entryEvent.picks, activeChip: entryEvent.active_chip };
}
