import { Player, Pos, UpcomingFixture } from '@fpl/engine';
import { cacheGet, cacheSet } from './cache.js';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

const TTL = {
  bootstrap: 15 * 60 * 1000,   // 15 min
  fixtures: 60 * 60 * 1000,    // 60 min
  elementSummary: 30 * 60 * 1000, // 30 min
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

// ---- Raw FPL types ----
interface RawElement {
  id: number;
  web_name: string;
  element_type: number; // 1=GK,2=DEF,3=MID,4=FWD,5=MNG
  team: number;
  now_cost: number;
  ep_next: string | null;
  ep_this: string | null;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  status: string;
  chance_of_playing_next_round: number | null;
  total_points: number;
}

interface RawTeam {
  id: number;
  short_name: string;
  name: string;
}

interface RawEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
}

interface RawBootstrap {
  elements: RawElement[];
  teams: RawTeam[];
  events: RawEvent[];
}

interface RawFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  finished: boolean;
}

interface RawElementSummaryFixture {
  event: number;
  is_home: boolean;
  difficulty: number;
  team_a: number;
  team_h: number;
}

interface RawElementSummary {
  fixtures: RawElementSummaryFixture[];
}

interface RawPick {
  element: number;
  position: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
  purchase_price?: number;
  selling_price?: number;
}

interface RawEntryHistoryRow {
  event: number;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
}

interface RawChipUse {
  name: string;
  event: number;
}

interface RawEntryHistory {
  current: RawEntryHistoryRow[];
  chips: RawChipUse[];
}

interface RawEntryEvent {
  picks: RawPick[];
  active_chip: string | null;
}

interface RawEntry {
  id: number;
  player_first_name: string;
  player_last_name: string;
  summary_overall_rank: number;
  summary_overall_points: number;
  current_event: number;
}

// ---- Normalization helpers ----

function normalizePos(elementType: number): Pos | null {
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

export async function fetchBootstrap(): Promise<RawBootstrap> {
  const cached = cacheGet<RawBootstrap>('bootstrap');
  if (cached) return cached;
  const data = await fplFetch<RawBootstrap>(`${FPL_BASE}/bootstrap-static/`);
  cacheSet('bootstrap', data, TTL.bootstrap);
  return data;
}

export async function fetchFixtures(gw: number): Promise<RawFixture[]> {
  const key = `fixtures:${gw}`;
  const cached = cacheGet<RawFixture[]>(key);
  if (cached) return cached;
  const data = await fplFetch<RawFixture[]>(`${FPL_BASE}/fixtures/?event=${gw}`);
  cacheSet(key, data, TTL.fixtures);
  return data;
}

export async function fetchElementSummary(playerId: number): Promise<RawElementSummary> {
  const key = `element:${playerId}`;
  const cached = cacheGet<RawElementSummary>(key);
  if (cached) return cached;
  const data = await fplFetch<RawElementSummary>(`${FPL_BASE}/element-summary/${playerId}/`);
  cacheSet(key, data, TTL.elementSummary);
  return data;
}

export async function fetchEntry(teamId: number): Promise<RawEntry> {
  const key = `entry:${teamId}`;
  const cached = cacheGet<RawEntry>(key);
  if (cached) return cached;
  const data = await fplFetch<RawEntry>(`${FPL_BASE}/entry/${teamId}/`);
  cacheSet(key, data, TTL.entry);
  return data;
}

export async function fetchEntryEvent(teamId: number, gw: number): Promise<RawEntryEvent> {
  const key = `entry:${teamId}:event:${gw}`;
  const cached = cacheGet<RawEntryEvent>(key);
  if (cached) return cached;
  const data = await fplFetch<RawEntryEvent>(`${FPL_BASE}/entry/${teamId}/event/${gw}/picks/`);
  cacheSet(key, data, TTL.entry);
  return data;
}

export async function fetchEntryHistory(teamId: number): Promise<RawEntryHistory> {
  const key = `entry:${teamId}:history`;
  const cached = cacheGet<RawEntryHistory>(key);
  if (cached) return cached;
  const data = await fplFetch<RawEntryHistory>(`${FPL_BASE}/entry/${teamId}/history/`);
  cacheSet(key, data, TTL.entry);
  return data;
}

// ---- Main player normalization ----

export async function fetchNormalizedPlayers(currentGw: number): Promise<Player[]> {
  const key = `normalized-players:${currentGw}`;
  const cached = cacheGet<Player[]>(key);
  if (cached) return cached;

  const bootstrap = await fetchBootstrap();
  const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

  // Collect per-player upcoming fixtures by fetching season-level fixtures once
  // We use bootstrap for basic data and build upcoming from fixtures endpoint
  const allFixtures = await fetchAllFixtures(currentGw);
  const fixturesByPlayer = buildFixturesByPlayer(allFixtures, currentGw);

  const players: Player[] = [];
  for (const el of bootstrap.elements) {
    const pos = normalizePos(el.element_type);
    if (!pos) continue; // skip managers

    const team = teamMap.get(el.team);
    const upcoming = fixturesByPlayer.get(el.id) ?? [];

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
      ownership: parseFloat(el.selected_by_percent) || 0,
      status: el.status,
      chanceNext: el.chance_of_playing_next_round,
      totalPoints: el.total_points,
      upcoming,
    });
  }

  cacheSet(key, players, TTL.bootstrap);
  return players;
}

interface ProcessedFixture {
  event: number;
  teamH: number;
  teamA: number;
  fdrH: number;
  fdrA: number;
}

async function fetchAllFixtures(currentGw: number): Promise<ProcessedFixture[]> {
  // Fetch upcoming 10 GWs of fixtures
  const gwsToFetch = Array.from({ length: 10 }, (_, i) => currentGw + i);
  const all: ProcessedFixture[] = [];

  await Promise.all(
    gwsToFetch.map(async (gw) => {
      try {
        const fixtures = await fetchFixtures(gw);
        for (const f of fixtures) {
          if (f.event != null) {
            all.push({
              event: f.event,
              teamH: f.team_h,
              teamA: f.team_a,
              fdrH: f.team_h_difficulty,
              fdrA: f.team_a_difficulty,
            });
          }
        }
      } catch {
        // GW might not exist yet — ignore
      }
    })
  );

  return all;
}

function buildFixturesByPlayer(
  fixtures: ProcessedFixture[],
  currentGw: number
): Map<number, UpcomingFixture[]> {
  // Group by (gw, team) so we can detect DGWs
  const byTeamGw = new Map<string, ProcessedFixture[]>();

  for (const f of fixtures) {
    if (f.event < currentGw) continue;

    const hKey = `${f.teamH}:${f.event}`;
    const aKey = `${f.teamA}:${f.event}`;

    const hList = byTeamGw.get(hKey) ?? [];
    hList.push(f);
    byTeamGw.set(hKey, hList);

    const aList = byTeamGw.get(aKey) ?? [];
    aList.push(f);
    byTeamGw.set(aKey, aList);
  }

  // Now build player upcoming via team — we need the bootstrap elements for this
  // We return a partial map here and it'll be merged in the caller
  // Since players share teams, build team→upcomingFixtures first
  const byTeam = new Map<number, UpcomingFixture[]>();

  // Collect all teams
  const allTeams = new Set<number>();
  for (const f of fixtures) {
    allTeams.add(f.teamH);
    allTeams.add(f.teamA);
  }

  for (const teamId of allTeams) {
    const upcoming: UpcomingFixture[] = [];
    const gwsSeen = new Set<number>();

    // Find all GWs for this team
    const teamGwFixtures = new Map<number, ProcessedFixture[]>();
    for (const f of fixtures) {
      if (f.event < currentGw) continue;
      if (f.teamH === teamId || f.teamA === teamId) {
        const existing = teamGwFixtures.get(f.event) ?? [];
        existing.push(f);
        teamGwFixtures.set(f.event, existing);
      }
    }

    // Build sorted upcoming
    const sortedGws = [...teamGwFixtures.keys()].sort((a, b) => a - b);
    for (const gw of sortedGws) {
      const gwFixtures = teamGwFixtures.get(gw)!;
      const isDGW = gwFixtures.length >= 2;

      for (const f of gwFixtures) {
        const isHome = f.teamH === teamId;
        const fdr = isHome ? f.fdrH : f.fdrA;
        const oppTeam = isHome ? f.teamA : f.teamH;

        upcoming.push({
          gw,
          oppTeam,
          isHome,
          fdr,
          isDGW,
        });
      }

      gwsSeen.add(gw);
    }

    byTeam.set(teamId, upcoming);
  }

  // Map from player id to fixtures — will be done in caller using player.team
  // Return team-based map and let caller use player.team to index
  return new Map<number, UpcomingFixture[]>(); // placeholder — see note below
}

// Revised: build per-player upcoming using team map
export async function buildPlayerUpcoming(
  teamId: number,
  currentGw: number,
  fixtures: ProcessedFixture[]
): Promise<UpcomingFixture[]> {
  const teamGwFixtures = new Map<number, ProcessedFixture[]>();
  for (const f of fixtures) {
    if (f.event < currentGw) continue;
    if (f.teamH === teamId || f.teamA === teamId) {
      const existing = teamGwFixtures.get(f.event) ?? [];
      existing.push(f);
      teamGwFixtures.set(f.event, existing);
    }
  }

  const sortedGws = [...teamGwFixtures.keys()].sort((a, b) => a - b);
  const upcoming: UpcomingFixture[] = [];

  for (const gw of sortedGws) {
    const gwFs = teamGwFixtures.get(gw)!;
    const isDGW = gwFs.length >= 2;

    for (const f of gwFs) {
      const isHome = f.teamH === teamId;
      upcoming.push({
        gw,
        oppTeam: isHome ? f.teamA : f.teamH,
        isHome,
        fdr: isHome ? f.fdrH : f.fdrA,
        isDGW,
      });
    }
  }

  return upcoming;
}

// Proper implementation of fetchNormalizedPlayers
export async function fetchNormalizedPlayersV2(currentGw: number): Promise<Player[]> {
  const key = `normalized-players-v2:${currentGw}`;
  const cached = cacheGet<Player[]>(key);
  if (cached) return cached;

  const bootstrap = await fetchBootstrap();
  const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));

  // Fetch all upcoming fixtures in batch
  const gwsToFetch = Array.from({ length: 10 }, (_, i) => currentGw + i);
  const allRawFixtures: ProcessedFixture[] = [];

  await Promise.all(
    gwsToFetch.map(async (gw) => {
      try {
        const fixtures = await fetchFixtures(gw);
        for (const f of fixtures) {
          if (f.event != null) {
            allRawFixtures.push({
              event: f.event,
              teamH: f.team_h,
              teamA: f.team_a,
              fdrH: f.team_h_difficulty,
              fdrA: f.team_a_difficulty,
            });
          }
        }
      } catch {
        // ignore missing GWs
      }
    })
  );

  // Build per-team fixture map
  const teamFixtureMap = new Map<number, UpcomingFixture[]>();
  const allTeamIds = new Set(bootstrap.teams.map((t) => t.id));

  for (const teamId of allTeamIds) {
    teamFixtureMap.set(
      teamId,
      await buildPlayerUpcoming(teamId, currentGw, allRawFixtures)
    );
  }

  const players: Player[] = [];

  for (const el of bootstrap.elements) {
    const pos = normalizePos(el.element_type);
    if (!pos) continue;

    const team = teamMap.get(el.team);
    const upcoming = teamFixtureMap.get(el.team) ?? [];

    players.push({
      id: el.id,
      name: el.web_name,
      pos,
      team: el.team,
      teamName: team?.short_name ?? String(el.team),
      price: el.now_cost / 10,
      epNext: parseFloat(el.ep_next ?? '0') || 0,
      ppg: parseFloat(el.points_per_game) || 0,
      form: parseFloat(el.form) || 0,
      ownership: parseFloat(el.selected_by_percent) || 0,
      status: el.status,
      chanceNext: el.chance_of_playing_next_round,
      totalPoints: el.total_points,
      upcoming,
    });
  }

  cacheSet(key, players, TTL.bootstrap);
  return players;
}

export async function getCurrentGw(): Promise<number> {
  const bootstrap = await fetchBootstrap();
  const currentEvent = bootstrap.events.find((e) => e.is_current);
  const nextEvent = bootstrap.events.find((e) => e.is_next);
  return nextEvent?.id ?? currentEvent?.id ?? 1;
}

export async function fetchUserTeam(teamId: number, gw: number) {
  const [entry, entryEvent] = await Promise.all([
    fetchEntry(teamId),
    fetchEntryEvent(teamId, gw),
  ]);
  return { entry, picks: entryEvent.picks, activeChip: entryEvent.active_chip };
}

export { RawEntry, RawPick, RawEntryHistory };
