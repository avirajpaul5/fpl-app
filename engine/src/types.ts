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
  epNext: number; // FPL expected pts next GW (primary signal)
  ppg: number; // season points per game
  form: number; // FPL form
  ownership: number; // %
  status: string; // a/d/i/s/u
  chanceNext: number | null;
  totalPoints: number;
  upcoming: UpcomingFixture[];
}

export interface ProjectedPlayer extends Player {
  projByGw: number[]; // projectedXp for [GW, GW+1, ... GW+H-1]
  projHorizon: number; // sum of projByGw
}

export interface Squad {
  players: Player[];
}

export interface XI {
  starters: Player[];
  bench: Player[];
  captain: Player;
  viceCaptain: Player;
}

export interface TransferMove {
  out: Player;
  in: Player;
  outSellingPrice: number;
  gain: number; // projected 5-GW gain
  tookHit: boolean;
  netGain: number; // gain - (tookHit ? 4 : 0)
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
