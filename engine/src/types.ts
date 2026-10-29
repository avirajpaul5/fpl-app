import type { PointsBreakdown } from './model.js';

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface UpcomingFixture {
  gw: number;
  oppTeam: number;
  isHome: boolean;
  fdr: number; // 1 (easy) .. 5 (hard)
  isDGW?: boolean;
  isBlank?: boolean;
}

export interface Player {
  id: number;
  name: string;
  pos: Pos;
  team: number;
  teamName: string;
  price: number; // £m
  epNext: number; // FPL's own ep_next (equals FPL form); display only
  ppg: number; // season points per game
  form: number; // FPL form
  expectedGoals: number; // cumulative season xG from the public FPL feed
  expectedAssists: number; // cumulative season xA from the public FPL feed
  minutes: number; // cumulative season minutes, used to rate xG/xA
  ownership: number; // %
  status: string; // a/d/i/s/u
  chanceNext: number | null;
  news?: string;
  totalPoints: number;
  upcoming: UpcomingFixture[];
}

export interface ProjectedPlayer extends Player {
  projByGw: number[]; // expected points for [GW, GW+1, ... GW+H-1]
  projHorizon: number; // sum of projByGw
  xMins?: number; // expected minutes next GW
  pStart?: number; // probability of starting next GW
  breakdown?: PointsBreakdown; // next-GW expected points by scoring component
}

export interface Squad {
  players: ProjectedPlayer[];
}

export interface XI {
  starters: ProjectedPlayer[];
  bench: ProjectedPlayer[];
  captain: ProjectedPlayer;
  viceCaptain: ProjectedPlayer;
}

export interface TransferMove {
  out: ProjectedPlayer;
  in: ProjectedPlayer;
  outSellingPrice: number;
  gain: number; // projected squad-points gain over the horizon attributed to this move
  tookHit: boolean;
  netGain: number; // gain - (tookHit ? 4 : 0)
}

/** One way to play the week: roll, or make n transfers. */
export interface TransferOption {
  transfers: number;
  hits: number;
  moves: TransferMove[];
  /** Projected squad points gained over the horizon (before hits). */
  gain: number;
  /** gain − hit cost − value of the free transfers spent. */
  score: number;
  bankAfter: number;
}

export interface TransferPlan {
  moves: TransferMove[];
  hitsTaken: number;
  projNetGain: number;
  recommendation: 'bank' | 'transfer' | 'hit';
  /** Plain-English explanation of the decision. */
  reason: string;
  /** Best plan for each transfer count, so the user can compare. */
  options: TransferOption[];
  freeTransfers: number;
  /** Free transfers carried into next GW if this plan is followed. */
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
  captain: ProjectedPlayer;
  viceCaptain: ProjectedPlayer;
  topThree: Array<{ player: ProjectedPlayer; projXp: number }>;
}

export interface RecommendationBundle {
  gw: number;
  xi: XI;
  captain: CaptainPick;
  transfers: TransferPlan;
  chips: ChipStatus;
}

export interface GwData {
  gw: number;
  isDGW: boolean;
  isBlank: boolean;
  deadline: string;
  finished: boolean;
}
