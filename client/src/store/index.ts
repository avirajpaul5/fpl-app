import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChipAvailability, TeamResponse } from '@/api/index.ts';

const ALL_CHIPS: ChipAvailability = {
  wildcard: true,
  freeHit: true,
  benchBoost: true,
  tripleCaptain: true,
};

interface AppState {
  teamId: number | null;
  setTeamId: (id: number | null) => void;
  freeTransfers: number;
  setFreeTransfers: (n: number) => void;
  bank: number | null;
  setBank: (bank: number) => void;
  chipAvailability: ChipAvailability;
  setChipAvailable: (chip: keyof ChipAvailability, available: boolean) => void;
  draftTeamId: number | null;
  draftSquadIds: number[];
  setDraftSquadIds: (ids: number[]) => void;
  sellingPrices: Record<number, number>;
  hydrateDeadlineDraft: (team: TeamResponse, force?: boolean) => void;
  replaceDraftPlayer: (outId: number, inId: number, inPrice: number) => void;
  resetDeadlineDraft: (team: TeamResponse) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      teamId: null,
      setTeamId: (id) => set({ teamId: id }),
      freeTransfers: 1,
      setFreeTransfers: (n) => set({ freeTransfers: n }),
      bank: null,
      setBank: (bank) => set({ bank }),
      chipAvailability: ALL_CHIPS,
      setChipAvailable: (chip, available) => set((state) => ({
        chipAvailability: { ...state.chipAvailability, [chip]: available },
      })),
      draftTeamId: null,
      draftSquadIds: [],
      setDraftSquadIds: (ids) => set({ draftSquadIds: ids }),
      sellingPrices: {},
      hydrateDeadlineDraft: (team, force = false) => set((state) => {
        if (!force && state.draftTeamId === team.teamId && state.draftSquadIds.length === 15) {
          return state;
        }
        return {
          draftTeamId: team.teamId,
          draftSquadIds: team.squad.map((player) => player.id),
          sellingPrices: team.sellingPrices,
          bank: team.bank,
          freeTransfers: team.freeTransfers,
          chipAvailability: team.chipAvailability,
        };
      }),
      replaceDraftPlayer: (outId, inId, inPrice) => set((state) => ({
        draftSquadIds: state.draftSquadIds.map((id) => id === outId ? inId : id),
        sellingPrices: Object.fromEntries([
          ...Object.entries(state.sellingPrices).filter(([id]) => Number(id) !== outId),
          [inId, inPrice],
        ]),
      })),
      resetDeadlineDraft: (team) => set({
        draftTeamId: team.teamId,
        draftSquadIds: team.squad.map((player) => player.id),
        sellingPrices: team.sellingPrices,
        bank: team.bank,
        freeTransfers: team.freeTransfers,
        chipAvailability: team.chipAvailability,
      }),
    }),
    {
      name: 'fpl-app-store',
      // teamId is public info — safe to store in localStorage
    }
  )
);
