const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---- Types (mirrors server response shapes) ----
export interface UpcomingFixture {
  gw: number;
  oppTeam: number;
  isHome: boolean;
  fdr: number;
  isDGW?: boolean;
}

export interface Player {
  id: number;
  name: string;
  pos: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: number;
  teamName: string;
  price: number;
  epNext: number;
  ppg: number;
  form: number;
  expectedGoals: number;
  expectedAssists: number;
  minutes: number;
  ownership: number;
  status: string;
  chanceNext: number | null;
  news?: string;
  totalPoints: number;
  upcoming: UpcomingFixture[];
  /** Expected points for the next GWs (index 0 = upcoming deadline). */
  projByGw: number[];
  /** Sum of the next five GWs. */
  projHorizon: number;
  xMins?: number;
  pStart?: number;
  breakdown?: PointsBreakdown;
}

export interface PointsBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
  defcon: number;
  cards: number;
}

export interface TransferMove {
  out: Player;
  in: Player;
  outSellingPrice: number;
  gain: number;
  tookHit: boolean;
  netGain: number;
}

export interface TransferOption {
  transfers: number;
  hits: number;
  moves: TransferMove[];
  gain: number;
  score: number;
  bankAfter: number;
}

export interface TransferPlan {
  moves: TransferMove[];
  hitsTaken: number;
  projNetGain: number;
  recommendation: 'bank' | 'transfer' | 'hit';
  reason: string;
  options: TransferOption[];
  freeTransfers: number;
  freeTransfersNext: number;
}

export interface ChipAdvice {
  recommend: boolean;
  gw: number | null;
  reason: string;
  projectedValue: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ChipStatus {
  wildcard: ChipAdvice;
  freeHit: ChipAdvice;
  benchBoost: ChipAdvice;
  tripleCaptain: ChipAdvice;
}

export type ChipKey = keyof ChipStatus;
/** Number of valid uses remaining this season for each chip (0..2). */
export type ChipAvailability = Record<ChipKey, number>;

export interface CaptainPick {
  captain: Player;
  viceCaptain: Player;
  topThree: Array<{ player: Player; projXp: number }>;
}

export interface XI {
  starters: Player[];
  bench: Player[];
  captain: Player;
  viceCaptain: Player;
}

export interface RecommendBundle {
  gw: number;
  deadline: string | null;
  /** Latest gameweek whose results the advice uses (all finished before the deadline). */
  resultsThroughGw: number;
  deadlineDraft: DeadlineDraft;
  xi: XI;
  captain: CaptainPick;
  transfers: TransferPlan;
  chips: ChipStatus;
}

export interface DeadlineDraft {
  squadIds: number[];
  bank: number;
  freeTransfers: number;
  sellingPrices: Record<number, number>;
  chipAvailability: ChipAvailability;
}

export interface TeamResponse {
  gw: number;
  deadline: string | null;
  resultsThroughGw: number;
  teamId: number;
  manager: { name: string; teamName: string | null; overallRank: number; overallPoints: number };
  squad: Player[];
  captainId: number | null;
  viceCaptainId: number | null;
  bank: number;
  sellingPrices: Record<number, number>;
  freeTransfers: number;
  freeTransfersSource: 'inferred';
  chipAvailability: ChipAvailability;
  /** Chips playable this gameweek (first-half chips expire after GW19). */
  chipsUsableNow: ChipAvailability;
  chipsUsed: Array<{ name: string; event: number }>;
  activeChip: string | null;
}

export interface TrackMove { out: number; in: number }

export interface TrackWeek {
  gw: number;
  /** The advice for this week only used results finished before this deadline. */
  deadline: string | null;
  resultsThroughGw: number;
  chip: string | null;
  freeTransfers: number;
  you: { points: number; transfers: TrackMove[]; hits: number; captain: number; captainPoints: number; movesRealised: number };
  app: {
    transfers: TrackMove[];
    hits: number;
    reason: string;
    captain: number;
    captainPoints: number;
    captainDelta: number;
    movesRealised: number;
    projectedGain: number;
  };
  follow: { points: number; transfers: TrackMove[]; captain: number; hits: number };
  windowGws: number;
}

export interface TrackResponse {
  ready: boolean;
  message?: string;
  fromGw: number;
  toGw: number;
  summary: {
    yourPoints: number;
    followPoints: number;
    followDiff: number;
    captainDelta: number;
    captainWeeks: number;
    appMovesRealised: number;
    yourMovesRealised: number;
  };
  weeks: TrackWeek[];
  accuracy: {
    n: number;
    modelCorrelation: number;
    formCorrelation: number;
    modelMae: number;
    formMae: number;
    buckets: Array<{ label: string; projected: number; actual: number; n: number }>;
  };
  players: Record<number, { name: string; pos: 'GK' | 'DEF' | 'MID' | 'FWD'; teamName: string }>;
  notes: string[];
}

export interface PlayersResponse {
  gw: number;
  players: Player[];
}

export interface OptimizeResponse {
  squad: { players: Player[] };
  totalCost: number;
  budget: number;
  bank: number;
  gw: number;
}

export interface HealthResponse {
  status: string;
  currentGw: number;
  cache: Record<string, { age: number; ttl: number }>;
  timestamp: string;
}

// ---- API functions ----

export function fetchHealth(): Promise<HealthResponse> {
  return get('/health');
}

export function fetchPlayers(params?: {
  pos?: string;
  maxPrice?: number;
  sort?: string;
}): Promise<PlayersResponse> {
  const qs = new URLSearchParams();
  if (params?.pos) qs.set('pos', params.pos);
  if (params?.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
  if (params?.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return get(`/players${q ? `?${q}` : ''}`);
}

export function fetchTeam(teamId: number): Promise<TeamResponse> {
  return get(`/team/${teamId}`);
}

export function fetchRecommend(teamId: number, ft?: number): Promise<RecommendBundle> {
  return get(`/recommend/${teamId}${ft != null ? `?ft=${ft}` : ''}`);
}

export function fetchDeadlineRecommend(
  teamId: number,
  draft: DeadlineDraft & { allowHits?: boolean }
): Promise<RecommendBundle> {
  return post(`/recommend/${teamId}`, draft);
}

export function fetchTrack(teamId: number): Promise<TrackResponse> {
  return get(`/track/${teamId}`);
}

export function fetchOptimize(opts: {
  teamId?: number;
  budget?: number;
  lockedPlayerIds?: number[];
  excludedPlayerIds?: number[];
}): Promise<OptimizeResponse> {
  return post('/optimize', opts);
}
