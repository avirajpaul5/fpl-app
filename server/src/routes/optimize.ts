import { Router, Request, Response } from 'express';
import { fetchNormalizedPlayersV2, getCurrentGw } from '../fplClient.js';
import { projectPlayers, draftSquad, ENGINE_CONFIG } from '@fpl/engine';

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
    const gw = await getCurrentGw();
    const allPlayersRaw = await fetchNormalizedPlayersV2(gw);

    let players = projectPlayers(allPlayersRaw);

    // Apply exclusions
    if (body.excludedPlayerIds?.length) {
      const excluded = new Set(body.excludedPlayerIds);
      players = players.filter((p) => !excluded.has(p.id));
    }

    // Apply budget
    const budget = body.budget ?? ENGINE_CONFIG.BUDGET;
    if (budget !== ENGINE_CONFIG.BUDGET) {
      players = players.filter((p) => p.price <= budget * 0.8); // rough filter
    }

    // Handle locked players — they must be in the squad
    const lockedIds = new Set(body.lockedPlayerIds ?? []);
    const lockedPlayers = players.filter((p) => lockedIds.has(p.id));
    const unlocked = players.filter((p) => !lockedIds.has(p.id));

    // Draft with locked players pre-included
    // We remove their slots from the quota before drafting the rest
    const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of lockedPlayers) {
      posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
    }

    let remainingBudget =
      budget - lockedPlayers.reduce((s, p) => s + p.price, 0);

    // Build a modified player list that includes locked and non-locked
    // For locked players, artificially lower price to 0 so they pass budget checks
    const forDraft = [
      ...lockedPlayers.map((p) => ({ ...p, price: 0 })), // locked slots are free
      ...unlocked.filter((p) => p.price <= remainingBudget),
    ];

    const squad = draftSquad(forDraft);

    // Restore real prices for locked players in output
    const lockedPriceMap = new Map(lockedPlayers.map((p) => [p.id, p.price]));
    const squadWithRealPrices = {
      players: squad.players.map((p) => ({
        ...p,
        price: lockedPriceMap.get(p.id) ?? p.price,
      })),
    };

    const totalCost = squadWithRealPrices.players.reduce((s, p) => s + p.price, 0);

    res.json({
      squad: squadWithRealPrices,
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
