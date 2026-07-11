import { Router, Request, Response } from 'express';
import { fetchNormalizedPlayersV2, getCurrentGw } from '../fplClient.js';
import { projectPlayers } from '@fpl/engine';
import type { Pos } from '@fpl/engine';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const gw = await getCurrentGw();
    const players = await fetchNormalizedPlayersV2(gw);
    const projected = projectPlayers(players);

    // Filtering
    let result = projected;

    const posFilter = req.query['pos'] as string | undefined;
    if (posFilter) {
      const positions = posFilter.split(',').map((p) => p.trim().toUpperCase()) as Pos[];
      result = result.filter((p) => positions.includes(p.pos));
    }

    const maxPrice = parseFloat(req.query['maxPrice'] as string ?? '');
    if (!isNaN(maxPrice)) {
      result = result.filter((p) => p.price <= maxPrice);
    }

    const minPrice = parseFloat(req.query['minPrice'] as string ?? '');
    if (!isNaN(minPrice)) {
      result = result.filter((p) => p.price >= minPrice);
    }

    const sort = (req.query['sort'] as string) ?? 'epNext';
    const dir = (req.query['dir'] as string) === 'asc' ? 1 : -1;

    result = result.sort((a, b) => {
      switch (sort) {
        case 'epNext': return dir * (b.epNext - a.epNext);
        case 'projHorizon': return dir * (b.projHorizon - a.projHorizon);
        case 'price': return dir * (b.price - a.price);
        case 'ownership': return dir * (b.ownership - a.ownership);
        case 'ppg': return dir * (b.ppg - a.ppg);
        case 'totalPoints': return dir * (b.totalPoints - a.totalPoints);
        default: return dir * (b.epNext - a.epNext);
      }
    });

    res.json({ gw, players: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params['id']!);
    const gw = await getCurrentGw();
    const players = await fetchNormalizedPlayersV2(gw);
    const player = players.find((p) => p.id === playerId);

    if (!player) {
      res.status(404).json({ error: `Player ${playerId} not found` });
      return;
    }

    const projected = projectPlayers([player])[0]!;
    res.json({ player: projected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
