import { Router, Request, Response } from 'express';
import {
  fetchNormalizedPlayersV2,
  getCurrentGw,
  fetchUserTeam,
  fetchEntry,
  fetchEntryHistory,
} from '../fplClient.js';
import { projectPlayers } from '@fpl/engine';

const router = Router();

router.get('/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params['teamId']!);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const gw = await getCurrentGw();
    const [players, userTeam, entry, history] = await Promise.all([
      fetchNormalizedPlayersV2(gw),
      fetchUserTeam(teamId, gw - 1 > 0 ? gw - 1 : gw),
      fetchEntry(teamId),
      fetchEntryHistory(teamId),
    ]);

    const playerMap = new Map(players.map((p) => [p.id, p]));
    const picks = userTeam.picks;

    const squadPlayers = picks
      .map((pick) => playerMap.get(pick.element))
      .filter(Boolean) as ReturnType<typeof playerMap.get>[];

    const projected = projectPlayers(squadPlayers as Parameters<typeof projectPlayers>[0]);

    const latestHistory = [...history.current].sort((a, b) => b.event - a.event)[0];
    const bank = latestHistory ? latestHistory.bank / 10 : 0;
    const sellingPrices = Object.fromEntries(
      picks.map((pick) => {
        const fallback = playerMap.get(pick.element)?.price ?? 0;
        return [pick.element, (pick.selling_price ?? pick.purchase_price ?? fallback * 10) / 10];
      })
    );
    const usedChipNames = new Set(history.chips.map((chip) => chip.name));

    const captain = picks.find((p) => p.is_captain);
    const viceCaptain = picks.find((p) => p.is_vice_captain);

    res.json({
      gw,
      teamId,
      manager: {
        name: `${entry.player_first_name} ${entry.player_last_name}`,
        overallRank: entry.summary_overall_rank,
        overallPoints: entry.summary_overall_points,
      },
      squad: projected,
      captainId: captain?.element ?? null,
      viceCaptainId: viceCaptain?.element ?? null,
      bank: parseFloat(bank.toFixed(1)),
      sellingPrices,
      freeTransfers: 1,
      freeTransfersSource: 'manual',
      chipAvailability: {
        wildcard: !usedChipNames.has('wildcard'),
        freeHit: !usedChipNames.has('freehit'),
        benchBoost: !usedChipNames.has('bboost'),
        tripleCaptain: !usedChipNames.has('3xc'),
      },
      chipsUsed: history.chips,
      activeChip: userTeam.activeChip,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
