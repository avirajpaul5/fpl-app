import { Router, Request, Response } from 'express';
import { optimizeSquad, ENGINE_CONFIG } from '@fpl/engine';
import { getProjectedPlayers } from '../seasonData.js';

const router = Router();

interface OptimizeBody {
  teamId?: number;
  budget?: number;
  lockedPlayerIds?: number[];
  excludedPlayerIds?: number[];
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const body: OptimizeBody = req.body ?? {};
    const { gw, players } = await getProjectedPlayers();
    const budget = body.budget ?? ENGINE_CONFIG.BUDGET;

    const squad = optimizeSquad(players, {
      budget,
      locked: body.lockedPlayerIds,
      excluded: body.excludedPlayerIds,
    });
    const totalCost = squad.players.reduce((s, p) => s + p.price, 0);

    res.json({
      squad,
      totalCost: parseFloat(totalCost.toFixed(1)),
      budget,
      bank: parseFloat((budget - totalCost).toFixed(1)),
      gw,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
