import { Router, Request, Response } from 'express';
import { adviseWeek, evaluateChips, pickCaptain, type ChipAvailability, type GwContext } from '@fpl/engine';
import { getProjectedPlayers } from '../seasonData.js';
import { loadManagerState } from '../managerState.js';
import { chipWindowEnd, chipsUsableNow } from '../chipAvailability.js';

const router = Router();

interface RecommendOverrides {
  squadIds?: number[];
  bank?: number;
  freeTransfers?: number;
  sellingPrices?: Record<number, number>;
  /** Season-level remaining uses per chip (0..2), as shown in the app. */
  chipAvailability?: Partial<ChipAvailability>;
  allowHits?: boolean;
}

async function recommend(req: Request, res: Response, overrides: RecommendOverrides) {
  try {
    const teamId = parseInt(req.params['teamId']!);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const { gw, players, data, resultsThroughGw } = await getProjectedPlayers();
    const state = await loadManagerState(teamId, data);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const squadIds = overrides.squadIds ?? state.squadIds;
    const squad = squadIds.map((id) => playerMap.get(id)).filter((p) => p != null);

    if (squad.length !== 15 || new Set(squadIds).size !== 15) {
      res.status(400).json({ error: 'Deadline draft must contain 15 unique valid players' });
      return;
    }

    const positionCounts = Object.fromEntries(
      ['GK', 'DEF', 'MID', 'FWD'].map((pos) => [pos, squad.filter((p) => p.pos === pos).length])
    );
    const legalPositions = positionCounts.GK === 2 && positionCounts.DEF === 5 &&
      positionCounts.MID === 5 && positionCounts.FWD === 3;
    const clubCounts = squad.reduce<Record<number, number>>((counts, player) => {
      counts[player.team] = (counts[player.team] ?? 0) + 1;
      return counts;
    }, {});
    if (!legalPositions || Object.values(clubCounts).some((count) => count > 3)) {
      res.status(400).json({ error: 'Deadline draft violates FPL position or club limits' });
      return;
    }

    const sellingPrices: Record<number, number> = { ...state.sellingPrices, ...overrides.sellingPrices };
    for (const player of squad) {
      if (sellingPrices[player.id] == null) sellingPrices[player.id] = player.price;
    }
    const bank = overrides.bank ?? state.bank;
    const freeTransfers = Math.max(0, Math.min(5, overrides.freeTransfers ?? state.freeTransfers));
    const chipAvailability = { ...state.chipAvailability, ...overrides.chipAvailability } as ChipAvailability;

    const week = adviseWeek(players, { gw, squad: squadIds, bank, freeTransfers, sellingPrices }, {
      allowHits: overrides.allowHits,
    });

    const budget = bank + squad.reduce((s, p) => s + (sellingPrices[p.id] ?? p.price), 0);
    const gwContext: GwContext = {
      gw,
      allPlayers: players,
      budget,
      transferGain: Math.max(0, week.plan.projNetGain),
      windowEnd: chipWindowEnd(gw),
    };

    res.json({
      gw,
      deadline: data.deadlines[gw] ?? null,
      resultsThroughGw,
      deadlineDraft: { squadIds, bank, freeTransfers, sellingPrices, chipAvailability },
      xi: week.xi,
      captain: pickCaptain(week.xi.starters),
      transfers: week.plan,
      chips: evaluateChips({ players: squad }, gw, gwContext, chipsUsableNow(chipAvailability, gw)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}

router.get('/:teamId', async (req, res) => {
  const ft = req.query['ft'] as string | undefined;
  await recommend(req, res, ft != null ? { freeTransfers: parseInt(ft) || 0 } : {});
});

router.post('/:teamId', async (req, res) => {
  await recommend(req, res, req.body ?? {});
});

export default router;
