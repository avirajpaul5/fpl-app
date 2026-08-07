import { Router, Request, Response } from 'express';
import {
  fetchNormalizedPlayers,
  getCurrentGw,
  fetchUserTeam,
  fetchFixtures,
  fetchEntryHistory,
} from '../fplClient.js';
import {
  projectPlayers,
  bestXI,
  pickCaptain,
  planTransfers,
  evaluateChips,
} from '@fpl/engine';
import type { Squad, GwContext, ChipAvailability } from '@fpl/engine';
import { inferChipAvailability } from '../chipAvailability.js';

const router = Router();

interface RecommendOverrides {
  squadIds?: number[];
  bank?: number;
  freeTransfers?: number;
  sellingPrices?: Record<number, number>;
  chipAvailability?: Partial<ChipAvailability>;
}

async function recommend(req: Request, res: Response, overrides: RecommendOverrides) {
  try {
    const teamId = parseInt(req.params['teamId']!);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const gw = await getCurrentGw();
    const publishedGw = gw - 1 > 0 ? gw - 1 : gw;
    const [allPlayersRaw, userTeam, history] = await Promise.all([
      fetchNormalizedPlayers(gw),
      fetchUserTeam(teamId, publishedGw),
      fetchEntryHistory(teamId),
    ]);

    const playerMap = new Map(allPlayersRaw.map((player) => [player.id, player]));
    const squadIds = overrides.squadIds ?? userTeam.picks.map((pick) => pick.element);
    const squadRaw = squadIds.map((id) => playerMap.get(id)).filter(Boolean) as typeof allPlayersRaw;

    if (squadRaw.length !== 15 || new Set(squadIds).size !== 15) {
      res.status(400).json({ error: 'Deadline draft must contain 15 unique valid players' });
      return;
    }

    const positionCounts = Object.fromEntries(
      ['GK', 'DEF', 'MID', 'FWD'].map((pos) => [pos, squadRaw.filter((p) => p.pos === pos).length])
    );
    const legalPositions = positionCounts.GK === 2 && positionCounts.DEF === 5 &&
      positionCounts.MID === 5 && positionCounts.FWD === 3;
    const clubCounts = squadRaw.reduce<Record<number, number>>((counts, player) => {
      counts[player.team] = (counts[player.team] ?? 0) + 1;
      return counts;
    }, {});
    if (!legalPositions || Object.values(clubCounts).some((count) => count > 3)) {
      res.status(400).json({ error: 'Deadline draft violates FPL position or club limits' });
      return;
    }

    const latestHistory = [...history.current].sort((a, b) => b.event - a.event)[0];
    const publishedSellingPrices: Record<number, number> = Object.fromEntries(
      userTeam.picks.map((pick) => {
        const fallback = playerMap.get(pick.element)?.price ?? 0;
        return [pick.element, (pick.selling_price ?? pick.purchase_price ?? fallback * 10) / 10];
      })
    );
    const sellingPrices: Record<number, number> = {
      ...publishedSellingPrices,
      ...overrides.sellingPrices,
    };
    for (const player of squadRaw) {
      if (sellingPrices[player.id] == null) sellingPrices[player.id] = player.price;
    }

    const bank = overrides.bank ?? (latestHistory ? latestHistory.bank / 10 : 0);
    const freeTransfers = Math.max(0, Math.min(5, overrides.freeTransfers ?? 1));
    const chipAvailability = overrides.chipAvailability ??
      inferChipAvailability(history.chips, gw);

    const allProjected = projectPlayers(allPlayersRaw);
    const squadProjected = projectPlayers(squadRaw);
    const squad: Squad = { players: squadProjected };
    const xi = bestXI(squad);
    const captain = pickCaptain(xi.starters);
    const transfers = planTransfers(squad, allProjected, freeTransfers, {
      bank,
      sellingPrices,
    });

    const blankCountsByGw: Record<number, number> = {};
    const dgwCountsByGw: Record<number, number> = {};
    for (let gameweek = gw; gameweek <= Math.min(38, gw + 15); gameweek++) {
      try {
        const fixtures = await fetchFixtures(gameweek);
        let blanks = 0;
        let doubles = 0;
        for (const player of squadRaw) {
          const playerFixtures = fixtures.filter(
            (fixture) => fixture.team_h === player.team || fixture.team_a === player.team
          );
          if (playerFixtures.length === 0) blanks++;
          if (playerFixtures.length >= 2) doubles++;
        }
        blankCountsByGw[gameweek] = blanks;
        dgwCountsByGw[gameweek] = doubles;
      } catch {
        // Future fixtures may not have been scheduled yet.
      }
    }

    const gwContext: GwContext = {
      gw,
      blankCountsByGw,
      dgwCountsByGw,
      totalGws: 38,
      allPlayers: allProjected,
    };

    res.json({
      gw,
      deadlineDraft: { squadIds, bank, freeTransfers, sellingPrices, chipAvailability },
      xi: {
        starters: xi.starters,
        bench: xi.bench,
        captain: xi.captain,
        viceCaptain: xi.viceCaptain,
      },
      captain,
      transfers,
      chips: evaluateChips(squad, gw, gwContext, chipAvailability),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}

router.get('/:teamId', async (req, res) => {
  const freeTransfers = parseInt(req.query['ft'] as string ?? '1') || 1;
  await recommend(req, res, { freeTransfers });
});

router.post('/:teamId', async (req, res) => {
  await recommend(req, res, req.body ?? {});
});

export default router;
