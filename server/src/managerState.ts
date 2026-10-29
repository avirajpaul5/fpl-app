import { inferFreeTransfers, sellingPrice, type ChipAvailability } from '@fpl/engine';
import {
  fetchEntry,
  fetchEntryEvent,
  fetchEntryHistory,
  fetchEntryTransfers,
  type RawEntry,
  type RawEntryHistory,
  type RawPick,
  type RawTransfer,
} from './fplClient.js';
import { chipsUsableNow, inferChipAvailability } from './chipAvailability.js';
import { priceAt, type SeasonData } from './seasonData.js';

export interface ManagerState {
  entry: RawEntry;
  history: RawEntryHistory;
  transfers: RawTransfer[];
  /** Latest GW whose team sheet is public (the deadline has passed). */
  publishedGw: number;
  picks: RawPick[];
  activeChip: string | null;
  squadIds: number[];
  bank: number;
  purchasePrices: Record<number, number>;
  sellingPrices: Record<number, number>;
  freeTransfers: number;
  chipAvailability: ChipAvailability;
  chipsUsableNow: ChipAvailability;
  chipByGw: Record<number, string>;
}

const CHIP_NAMES: Record<string, string> = { wildcard: 'wildcard', freehit: 'freehit', bboost: 'bboost', '3xc': '3xc' };

export async function loadManagerState(teamId: number, data: SeasonData): Promise<ManagerState> {
  const gw = data.nextGw;
  const [entry, history, transfers] = await Promise.all([
    fetchEntry(teamId),
    fetchEntryHistory(teamId),
    fetchEntryTransfers(teamId),
  ]);
  const publishedGw = Math.max(entry.started_event ?? 1, Math.min(entry.current_event || gw - 1, gw - 1) || 1);
  const event = await fetchEntryEvent(teamId, publishedGw);
  const chipByGw: Record<number, string> = {};
  for (const c of history.chips) chipByGw[c.event] = CHIP_NAMES[c.name] ?? c.name;

  // A Free Hit squad reverts, so the deadline squad is the last non-Free-Hit team.
  let squadIds = event.picks.map((p) => p.element);
  if (chipByGw[publishedGw] === 'freehit' && publishedGw > (entry.started_event ?? 1)) {
    let g = publishedGw - 1;
    while (g > (entry.started_event ?? 1) && chipByGw[g] === 'freehit') g--;
    squadIds = (await fetchEntryEvent(teamId, g)).picks.map((p) => p.element);
  }

  const purchasePrices = reconstructPurchasePrices(data, entry, transfers, chipByGw, await initialSquad(teamId, entry), gw);
  const sellingPrices: Record<number, number> = {};
  for (const id of squadIds) {
    const el = data.elements.get(id);
    const now = el ? el.now_cost / 10 : 0;
    const pick = event.picks.find((p) => p.element === id);
    sellingPrices[id] = pick?.selling_price != null
      ? pick.selling_price / 10
      : sellingPrice(purchasePrices[id] ?? now, now);
  }

  const latest = [...history.current].sort((a, b) => b.event - a.event)[0];
  const weeks = history.current.map((h) => ({ gw: h.event, transfers: h.event_transfers, chip: chipByGw[h.event] ?? null }));
  const remaining = inferChipAvailability(history.chips, gw);

  return {
    entry,
    history,
    transfers,
    publishedGw,
    picks: event.picks,
    activeChip: event.active_chip,
    squadIds,
    bank: latest ? latest.bank / 10 : 0,
    purchasePrices,
    sellingPrices,
    freeTransfers: inferFreeTransfers(weeks, gw, entry.started_event ?? 1),
    chipAvailability: remaining,
    chipsUsableNow: chipsUsableNow(remaining, gw),
    chipByGw,
  };
}

async function initialSquad(teamId: number, entry: RawEntry): Promise<number[]> {
  const start = entry.started_event ?? 1;
  return (await fetchEntryEvent(teamId, start)).picks.map((p) => p.element);
}

/** Purchase price of every player ever owned, replaying transfers (Free Hit weeks revert). */
export function reconstructPurchasePrices(
  data: SeasonData,
  entry: RawEntry,
  transfers: RawTransfer[],
  chipByGw: Record<number, string>,
  startSquad: number[],
  nowGw: number
): Record<number, number> {
  const start = entry.started_event ?? 1;
  const purchase: Record<number, number> = {};
  for (const id of startSquad) {
    const el = data.elements.get(id);
    if (el) purchase[id] = priceAt(el, start, nowGw);
  }
  const ordered = [...transfers].sort((a, b) => a.event - b.event || a.time.localeCompare(b.time));
  for (const t of ordered) {
    if (chipByGw[t.event] === 'freehit') continue;
    delete purchase[t.element_out];
    purchase[t.element_in] = t.element_in_cost / 10;
  }
  return purchase;
}
