import type { ChipAvailability, ChipKey } from '@fpl/engine';

interface ChipUse {
  name: string;
  event: number;
}

const SECOND_CHIP_WINDOW_START_GW = 20;

const HISTORY_NAME_BY_CHIP: Record<ChipKey, string> = {
  wildcard: 'wildcard',
  freeHit: 'freehit',
  benchBoost: 'bboost',
  tripleCaptain: '3xc',
};

/**
 * FPL grants one set of chips for GW1-19 and refreshes it for GW20-38.
 * An unused first-half chip expires rather than carrying into the second half.
 */
export function inferChipAvailability(chips: ChipUse[], currentGw: number): ChipAvailability {
  const isSecondWindow = currentGw >= SECOND_CHIP_WINDOW_START_GW;
  const windowUses = chips.filter((chip) =>
    isSecondWindow
      ? chip.event >= SECOND_CHIP_WINDOW_START_GW
      : chip.event < SECOND_CHIP_WINDOW_START_GW
  );
  const availableUsesAtWindowStart = isSecondWindow ? 1 : 2;

  return Object.fromEntries(
    (Object.keys(HISTORY_NAME_BY_CHIP) as ChipKey[]).map((chip) => {
      const historyName = HISTORY_NAME_BY_CHIP[chip];
      const usedInWindow = windowUses.filter((use) => use.name === historyName).length;
      return [chip, Math.max(0, availableUsesAtWindowStart - usedInWindow)];
    })
  ) as ChipAvailability;
}

/**
 * Chips that can actually be played this gameweek: a first-half chip is
 * playable only while its first-half use is unspent (remaining 2 of 2).
 */
export function chipsUsableNow(remaining: ChipAvailability, currentGw: number): ChipAvailability {
  const isSecondWindow = currentGw >= SECOND_CHIP_WINDOW_START_GW;
  return Object.fromEntries(
    (Object.keys(remaining) as ChipKey[]).map((chip) => [
      chip,
      isSecondWindow ? Math.min(1, remaining[chip]) : Math.max(0, remaining[chip] - 1),
    ])
  ) as ChipAvailability;
}

/** Last GW of the chip window containing `gw`. */
export function chipWindowEnd(gw: number): number {
  return gw < SECOND_CHIP_WINDOW_START_GW ? SECOND_CHIP_WINDOW_START_GW - 1 : 38;
}
