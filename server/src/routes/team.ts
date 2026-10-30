import { Router, Request, Response } from 'express';
import { getProjectedPlayers } from '../seasonData.js';
import { loadManagerState } from '../managerState.js';

const router = Router();

router.get('/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params['teamId']!);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const { gw, players, data, resultsThroughGw } = await getProjectedPlayers();
    const state = await loadManagerState(teamId, data);
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const captain = state.picks.find((p) => p.is_captain);
    const viceCaptain = state.picks.find((p) => p.is_vice_captain);

    res.json({
      gw,
      deadline: data.deadlines[gw] ?? null,
      resultsThroughGw,
      teamId,
      manager: {
        name: `${state.entry.player_first_name} ${state.entry.player_last_name}`,
        teamName: state.entry.name ?? null,
        overallRank: state.entry.summary_overall_rank,
        overallPoints: state.entry.summary_overall_points,
      },
      squad: state.squadIds.map((id) => playerMap.get(id)).filter(Boolean),
      captainId: captain?.element ?? null,
      viceCaptainId: viceCaptain?.element ?? null,
      bank: parseFloat(state.bank.toFixed(1)),
      sellingPrices: state.sellingPrices,
      freeTransfers: state.freeTransfers,
      freeTransfersSource: 'inferred',
      chipAvailability: state.chipAvailability,
      chipsUsableNow: state.chipsUsableNow,
      chipsUsed: state.history.chips,
      activeChip: state.activeChip,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
