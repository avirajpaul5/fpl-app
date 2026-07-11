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
  ownership: number;
  status: string;
  chanceNext: number | null;
  totalPoints: number;
  upcoming: UpcomingFixture[];
  projByGw: number[];
  projHorizon: number;
}

export interface TransferMove {
  out: Player;
  in: Player;
  outSellingPrice: number;
  gain: number;
  tookHit: boolean;
  netGain: number;
}

export interface TransferPlan {
  moves: TransferMove[];
  hitsTaken: number;
  projNetGain: number;
  recommendation: 'bank' | 'transfer' | 'hit';
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
export type ChipAvailability = Record<ChipKey, boolean>;

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
  teamId: number;
  manager: { name: string; overallRank: number; overallPoints: number };
  squad: Player[];
  captainId: number | null;
  viceCaptainId: number | null;
  bank: number;
  sellingPrices: Record<number, number>;
  freeTransfers: number;
  freeTransfersSource: 'manual';
  chipAvailability: ChipAvailability;
  chipsUsed: Array<{ name: string; event: number }>;
  activeChip: string | null;
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
  draft: DeadlineDraft
): Promise<RecommendBundle> {
  return post(`/recommend/${teamId}`, draft);
}

export function fetchOptimize(opts: {
  teamId?: number;
  budget?: number;
  lockedPlayerIds?: number[];
  excludedPlayerIds?: number[];
}): Promise<OptimizeResponse> {
  return post('/optimize', opts);
}
