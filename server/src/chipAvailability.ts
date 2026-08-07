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
