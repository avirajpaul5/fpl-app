import { Router, Request, Response } from 'express';
import {
  adviseWeek,
  bestXI,
  followAdvisor,
  inferFreeTransfers,
  optimizeSquad,
  pickCaptain,
  scoreSelection,
  sellingPrice,
  type Advice,
  type AdvisorState,
  type ChipName,
  type ProjectedPlayer,
  type ReplayData,
} from '@fpl/engine';
import { cacheGet, cacheSet } from '../cache.js';
import { fetchEntryEvent, fetchNormalizedPlayers, type RawEntryEvent } from '../fplClient.js';
import { loadSeasonData, priceAt, projectAtDeadline, type SeasonData } from '../seasonData.js';
import { loadManagerState, reconstructPurchasePrices } from '../managerState.js';

const router = Router();

/** GWs after a decision over which a transfer's realised value is measured. */
const AUDIT_WINDOW = 4;

interface Move { out: number; in: number }

function replayData(data: SeasonData): ReplayData {
  const byGw = new Map<string, { pts: number; mins: number }>();
  for (const [id, rows] of data.history) {
    for (const r of rows) byGw.set(`${id}:${r.gw}`, { pts: r.points, mins: r.minutes });
  }
  return {
    pos: (id) => {
      const t = data.elements.get(id)?.element_type;
      return t === 1 ? 'GK' : t === 2 ? 'DEF' : t === 4 ? 'FWD' : 'MID';
    },
    actual: (id, gw) => byGw.get(`${id}:${gw}`) ?? { pts: 0, mins: 0 },
    price: (id, gw) => {
      const el = data.elements.get(id);
      return el ? priceAt(el, gw, data.nextGw) : 0;
    },
  };
}

function captainOf(picks: RawEntryEvent['picks']) {
  return {
    captain: picks.find((p) => p.is_captain)?.element ?? picks[0]!.element,
    vice: picks.find((p) => p.is_vice_captain)?.element ?? picks[1]!.element,
  };
}

router.get('/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params['teamId']!);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }
    const data = await loadSeasonData();
    const lastGw = data.finishedGws[data.finishedGws.length - 1] ?? 0;
    const cacheKey = `track:${teamId}:${lastGw}`;
    const hit = cacheGet<unknown>(cacheKey);
    if (hit) {
      res.json(hit);
      return;
    }

    const state = await loadManagerState(teamId, data);
    const start = state.entry.started_event ?? 1;
    if (lastGw <= start) {
      res.json({ ready: false, message: 'The track record starts once two gameweeks have been played.' });
      return;
    }

    const display = await fetchNormalizedPlayers(data.nextGw);
    const rd = replayData(data);
    const gws = Array.from({ length: lastGw - start }, (_, i) => start + 1 + i);
    const picksByGw = new Map<number, RawEntryEvent>();
    await Promise.all(Array.from({ length: lastGw - start + 1 }, (_, i) => start + i).map(async (gw) => {
      picksByGw.set(gw, await fetchEntryEvent(teamId, gw));
    }));
    const projections = new Map<number, ProjectedPlayer[]>();
    for (const gw of gws) projections.set(gw, projectAtDeadline(data, display, gw));

    const chips: Record<number, ChipName> = {};
    for (const [gw, chip] of Object.entries(state.chipByGw)) chips[Number(gw)] = chip as ChipName;
    const historyByGw = new Map(state.history.current.map((h) => [h.event, h]));
    const actualPoints = (gw: number) => {
      const h = historyByGw.get(gw);
      return h ? h.points - h.event_transfers_cost : 0;
    };

    // ---- 1. Follow the app from your first squad ----
    const advise = (s: AdvisorState): Advice => {
      const all = projections.get(s.gw)!;
      if (chips[s.gw] === 'wildcard') {
        const budget = s.bank + s.squad.reduce((sum, id) => sum + (s.sellingPrices[id] ?? 0), 0);
        const rebuilt = optimizeSquad(all, { budget, horizon: 8 });
        const xi = bestXI(rebuilt);
        const outs = s.squad.filter((id) => !rebuilt.players.some((p) => p.id === id));
        const ins = rebuilt.players.filter((p) => !s.squad.includes(p.id)).map((p) => p.id);
        return {
          transfers: outs.map((out, i) => ({ out, in: ins[i]! })),
          starters: xi.starters.map((p) => p.id), bench: xi.bench.map((p) => p.id),
          captain: xi.captain.id, vice: xi.viceCaptain.id, reason: 'Wildcard rebuild',
        };
      }
      return adviseWeek(all, s).advice;
    };
    const startSquad = picksByGw.get(start)!.picks.map((p) => p.element);
    const startPurchase = Object.fromEntries(startSquad.map((id) => [id, rd.price(id, start)]));
    const freeHitPoints = Object.fromEntries(gws.filter((g) => chips[g] === 'freehit').map((g) => [g, actualPoints(g)]));
    const follow = followAdvisor(rd, advise, {
      squad: startSquad,
      purchasePrices: startPurchase,
      bank: (historyByGw.get(start)?.bank ?? 0) / 10,
      freeTransfers: 1,
    }, start + 1, lastGw, chips, freeHitPoints);

    // ---- 2. Week-by-week audit of advice on your real squad ----
    const weeks = state.history.current.map((h) => ({ gw: h.event, transfers: h.event_transfers, chip: state.chipByGw[h.event] ?? null }));
    const realised = (moves: Move[], gw: number) => {
      let sum = 0;
      for (let g = gw; g < Math.min(gw + AUDIT_WINDOW, lastGw + 1); g++) {
        for (const m of moves) sum += rd.actual(m.in, g).pts - rd.actual(m.out, g).pts;
      }
      return sum;
    };
    const audit = gws.map((gw) => {
      const chip = chips[gw] ?? null;
      const all = projections.get(gw)!;
      let prev = gw - 1;
      while (prev > start && chips[prev] === 'freehit') prev--;
      const squadBefore = picksByGw.get(prev)!.picks.map((p) => p.element);
      const transfersBefore = state.transfers.filter((t) => t.event < gw);
      const purchase = reconstructPurchasePrices(data, state.entry, transfersBefore, state.chipByGw, startSquad, data.nextGw);
      const sell = Object.fromEntries(squadBefore.map((id) => [id, sellingPrice(purchase[id] ?? rd.price(id, gw), rd.price(id, gw))]));
      const ft = inferFreeTransfers(weeks, gw, start);
      const bank = (historyByGw.get(prev)?.bank ?? 0) / 10;
      const plan = chip === 'freehit' || chip === 'wildcard'
        ? null
        : adviseWeek(all, { gw, squad: squadBefore, bank, freeTransfers: ft, sellingPrices: sell });
      const yourMoves: Move[] = chip === 'freehit' ? [] : state.transfers
        .filter((t) => t.event === gw)
        .map((t) => ({ out: t.element_out, in: t.element_in }));
      const yourHits = (historyByGw.get(gw)?.event_transfers_cost ?? 0);

      // Captaincy on your actual XI: the app's pick vs yours.
      const picks = picksByGw.get(gw)!.picks;
      const starters = picks.filter((p) => p.position <= 11).map((p) => p.element);
      const bench = picks.filter((p) => p.position > 11).map((p) => p.element);
      const mine = captainOf(picks);
      const byId = new Map(all.map((p) => [p.id, p]));
      const appCap = pickCaptain(starters.map((id) => byId.get(id)).filter((p) => p != null));
      const chipForScore = chip === 'bboost' || chip === '3xc' ? chip : null;
      const yourScore = scoreSelection(rd, gw, { starters, bench, captain: mine.captain, vice: mine.vice }, chipForScore);
      const appScore = scoreSelection(rd, gw, { starters, bench, captain: appCap.captain.id, vice: appCap.viceCaptain.id }, chipForScore);
      const followWeek = follow.weeks.find((w) => w.gw === gw)!;

      return {
        gw,
        chip,
        freeTransfers: ft,
        you: {
          points: actualPoints(gw),
          transfers: yourMoves,
          hits: yourHits / 4,
          captain: mine.captain,
          captainPoints: rd.actual(mine.captain, gw).pts,
          movesRealised: realised(yourMoves, gw) - yourHits,
        },
        app: {
          transfers: plan?.advice.transfers ?? [],
          hits: plan?.plan.hitsTaken ?? 0,
          reason: plan?.plan.reason ?? (chip === 'freehit' ? 'Free Hit week — not audited.' : 'Wildcard week — not audited.'),
          captain: appCap.captain.id,
          captainPoints: rd.actual(appCap.captain.id, gw).pts,
          captainDelta: appScore - yourScore,
          movesRealised: plan ? realised(plan.advice.transfers, gw) - 4 * plan.plan.hitsTaken : 0,
          projectedGain: plan?.plan.projNetGain ?? 0,
        },
        follow: { points: followWeek.points, transfers: followWeek.transfers, captain: followWeek.captain, hits: followWeek.hits },
        windowGws: Math.min(AUDIT_WINDOW, lastGw - gw + 1),
      };
    });

    // ---- 3. Projection accuracy: the app's model vs FPL's own expected points (= form) ----
    const pairs: Array<{ model: number; form: number; actual: number }> = [];
    for (const gw of gws) {
      const all = projections.get(gw)!;
      for (const p of all) {
        const played = [1, 2, 3, 4].some((k) => rd.actual(p.id, gw - k).mins > 0);
        if (!played) continue;
        const recent = [1, 2, 3, 4].map((k) => gw - k).filter((g) => g >= 1);
        const form = recent.reduce((s, g) => s + rd.actual(p.id, g).pts, 0) / Math.max(1, recent.length);
        pairs.push({ model: p.projByGw[0] ?? 0, form, actual: rd.actual(p.id, gw).pts });
      }
    }
    const corr = (xs: number[], ys: number[]) => {
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let c = 0, vx = 0, vy = 0;
      for (let i = 0; i < n; i++) { c += (xs[i]! - mx) * (ys[i]! - my); vx += (xs[i]! - mx) ** 2; vy += (ys[i]! - my) ** 2; }
      return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : 0;
    };
    const buckets = [0, 1, 2, 3, 4, 5, 6].map((lo) => {
      const inB = pairs.filter((p) => p.model >= lo && (lo === 6 ? true : p.model < lo + 1));
      return {
        label: lo === 6 ? '6+' : `${lo}–${lo + 1}`,
        projected: inB.reduce((s, p) => s + p.model, 0) / Math.max(1, inB.length),
        actual: inB.reduce((s, p) => s + p.actual, 0) / Math.max(1, inB.length),
        n: inB.length,
      };
    }).filter((b) => b.n > 0);

    const actualTotal = gws.reduce((s, g) => s + actualPoints(g), 0);
    const ids = new Set<number>();
    for (const a of audit) {
      [...a.you.transfers, ...a.app.transfers, ...a.follow.transfers].forEach((m) => { ids.add(m.in); ids.add(m.out); });
      ids.add(a.you.captain); ids.add(a.app.captain); ids.add(a.follow.captain);
    }
    const byId = new Map(display.map((p) => [p.id, p]));
    const players = Object.fromEntries([...ids].filter((id) => byId.has(id)).map((id) => {
      const p = byId.get(id)!;
      return [id, { name: p.name, pos: p.pos, teamName: p.teamName }];
    }));
    const audited = audit.filter((a) => a.chip !== 'freehit' && a.chip !== 'wildcard');

    const body = {
      ready: true,
      fromGw: start + 1,
      toGw: lastGw,
      summary: {
        yourPoints: actualTotal,
        followPoints: follow.total,
        followDiff: follow.total - actualTotal,
        captainDelta: audited.reduce((s, a) => s + a.app.captainDelta, 0),
        captainWeeks: audited.length,
        appMovesRealised: audited.reduce((s, a) => s + a.app.movesRealised, 0),
        yourMovesRealised: audited.reduce((s, a) => s + a.you.movesRealised, 0),
      },
      weeks: audit,
      accuracy: {
        n: pairs.length,
        modelCorrelation: corr(pairs.map((p) => p.model), pairs.map((p) => p.actual)),
        formCorrelation: corr(pairs.map((p) => p.form), pairs.map((p) => p.actual)),
        modelMae: pairs.reduce((s, p) => s + Math.abs(p.model - p.actual), 0) / Math.max(1, pairs.length),
        formMae: pairs.reduce((s, p) => s + Math.abs(p.form - p.actual), 0) / Math.max(1, pairs.length),
        buckets,
      },
      players,
      notes: [
        'Each week uses only results available before that deadline.',
        'Injury news and exact historical prices are not archived by FPL, so the replay ignores flags and interpolates prices.',
        'Chips are replayed in the weeks you played them; Free Hit weeks keep your real score.',
      ],
    };
    cacheSet(cacheKey, body, 30 * 60 * 1000);
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
